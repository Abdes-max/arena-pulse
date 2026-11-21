import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { IapService } from './iap.service';
import { AdminUiMode, MeResponse, OrganizationSummary, OrganizerUser } from './models';

// Same contract as apps/web/src/app/admin/core/auth.service.ts (this file is
// a deliberate port, not a shared lib -- see models.ts's comment) against
// the exact same /auth/* endpoints. The refresh cookie already works
// cross-origin from a Capacitor webview: apps/api/src/auth/auth.controller.ts's
// setRefreshCookie sets SameSite=None+Secure in production specifically for
// this (see its own comment), so no server-side change was needed here.

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Optional: without it, a team manager's account (no organization yet). */
  organizationName?: string;
}

export interface RegisterResponse {
  status: 'PENDING_EMAIL_VERIFICATION';
  email: string;
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  /** Only present because every call below sends NATIVE_HEADERS. */
  refreshToken?: string;
}

// Tells the API to also hand the refresh token back in the response body (and
// to accept it back in the body): the webview's cross-site cookie is not
// reliable on iOS, which used to sign the organizer out on most app restarts.
// The token is kept in the app's own storage instead; the cookie still works
// as a fallback.
const NATIVE_HEADERS = { 'X-Client': 'native' };
const REFRESH_TOKEN_KEY = 'tournarena.refreshToken';
const LAST_EMAIL_KEY = 'tournarena.lastEmail';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage unavailable: the session just won't survive a restart.
  }
}

@Injectable({ providedIn: 'root' })
export class OrganizerAuthService {
  private readonly http = inject(HttpClient);
  private readonly iap = inject(IapService);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentUserSignal = signal<OrganizerUser | null>(null);
  private readonly organizationsSignal = signal<OrganizationSummary[]>([]);
  private refreshing: Promise<boolean> | null = null;

  readonly isAuthenticated = computed(() => this.accessToken() !== null);
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly simpleMode = computed(() => this.currentUserSignal()?.adminUiMode !== 'FULL');
  readonly organizations = this.organizationsSignal.asReadonly();
  /**
   * One account for organizers and team managers: where it lands by default
   * -- the organizer area with an organization, the manager's space otherwise.
   */
  readonly homeUrl = computed(() =>
    this.organizationsSignal().length > 0 ? '/organizer/tournaments' : '/espace-responsable',
  );

  getAccessToken(): string | null {
    return this.accessToken();
  }

  /** The last account that signed in on this device, to pre-fill the login form. */
  lastEmail(): string {
    return readStored(LAST_EMAIL_KEY) ?? '';
  }

  /** No session is issued yet -- the account stays unusable until the emailed link is clicked (see verifyEmail below). */
  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    return firstValueFrom(
      this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register`, payload),
    );
  }

  /** Consumes the token from the verification email and logs the now-verified account in directly. */
  async verifyEmail(token: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(
        `${environment.apiUrl}/auth/verify-email/${token}`,
        {},
        { withCredentials: true, headers: NATIVE_HEADERS },
      ),
    );
    this.accessToken.set(response.accessToken);
    this.rememberSession(response.refreshToken);
    await this.loadProfile();
  }

  /** Always resolves the same way whether or not the account exists or is already verified -- mirrors the backend's no-leak posture. */
  async resendVerification(email: string): Promise<void> {
    await firstValueFrom(
      // Reuses the login endpoint's body shape purely for its `email` field -- password is ignored server-side.
      this.http.post<void>(`${environment.apiUrl}/auth/resend-verification`, {
        email,
        password: '',
      }),
    );
  }

  /**
   * Always resolves the same way whether or not the account exists --
   * mirrors the backend's no-leak posture. Unlike web's AuthService, there
   * is no matching resetPassword() here: the emailed link always opens the
   * *web* app (AuthService.buildResetPasswordUrl, apps/api), same reasoning
   * as this file's own verifyEmail -- apps/mobile has no deep-linking set up
   * to catch it back into the native app (see register.page.ts's comment).
   */
  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${environment.apiUrl}/auth/request-password-reset`, { email }),
    );
  }

  /** rememberMe false: the API sets a session-only refresh cookie (gone once the app closes). */
  async login(email: string, password: string, rememberMe = true): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(
        `${environment.apiUrl}/auth/login`,
        { email, password, rememberMe },
        { withCredentials: true, headers: NATIVE_HEADERS },
      ),
    );
    this.accessToken.set(response.accessToken);
    // Unchecked "Se souvenir de moi": nothing is kept, the session ends with the app.
    this.rememberSession(rememberMe ? response.refreshToken : undefined);
    writeStored(LAST_EMAIL_KEY, email.trim().toLowerCase());
    await this.loadProfile();
  }

  /**
   * Restores a session on app startup, from the refresh token kept in the app's
   * storage (or the httpOnly cookie as a fallback). Concurrent calls share one
   * request: the token rotates on every use, and reusing a rotated one revokes
   * the whole session.
   */
  silentRefresh(): Promise<boolean> {
    this.refreshing ??= this.doSilentRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doSilentRefresh(): Promise<boolean> {
    const stored = readStored(REFRESH_TOKEN_KEY);
    try {
      const response = await firstValueFrom(
        this.http.post<TokenResponse>(
          `${environment.apiUrl}/auth/refresh`,
          stored ? { refreshToken: stored } : {},
          { withCredentials: true, headers: NATIVE_HEADERS },
        ),
      );
      this.accessToken.set(response.accessToken);
      // Rotated token. Only re-stored when one was already kept, so a session
      // that opted out of "Se souvenir de moi" never becomes persistent.
      if (stored) {
        this.rememberSession(response.refreshToken);
      }
      await this.loadProfile();
      return true;
    } catch (error) {
      // Only a rejected token ends the stored session. Offline or a server
      // hiccup at launch keeps it for the next attempt.
      const rejected =
        error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
      if (rejected) {
        writeStored(REFRESH_TOKEN_KEY, null);
      }
      // Already signed in and just offline for a moment: stay signed in.
      if (rejected || this.accessToken() === null) {
        this.clearSession();
      }
      return false;
    }
  }

  /**
   * Permanent, immediate deletion (see AuthService.deleteAccount server-side,
   * same endpoint as apps/web's admin account page). The caller is expected
   * to redirect away right after this resolves.
   *
   * `confirmation` goes as a query param, not a DELETE body -- found the
   * hard way on a real iPhone via TestFlight (2026-09): WKWebView's own
   * fetch() (what this app's WebView uses once CapacitorHttp is disabled,
   * see capacitor.config.ts's own comment) silently drops a DELETE
   * request's body in transit, even though the exact same call worked
   * perfectly in every desktop-browser test this feature ever got. A query
   * param has no such ambiguity on any client. See
   * apps/api/src/auth/auth.controller.ts's matching comment.
   */
  async deleteAccount(confirmation: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${environment.apiUrl}/auth/me`, {
        params: { confirmation },
        withCredentials: true,
      }),
    );
    writeStored(REFRESH_TOKEN_KEY, null);
    writeStored(LAST_EMAIL_KEY, null);
    this.clearSession();
  }

  /** An account without an organization starts organizing (POST /organizations). */
  async createOrganization(name: string): Promise<void> {
    await firstValueFrom(this.http.post(`${environment.apiUrl}/organizations`, { name }));
    await this.loadProfile();
  }

  async logout(): Promise<void> {
    const stored = readStored(REFRESH_TOKEN_KEY);
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.apiUrl}/auth/logout`,
          stored ? { refreshToken: stored } : {},
          { withCredentials: true },
        ),
      );
    } finally {
      writeStored(REFRESH_TOKEN_KEY, null);
      this.clearSession();
    }
  }

  async loadProfile(): Promise<void> {
    const me = await firstValueFrom(
      this.http.get<MeResponse>(`${environment.apiUrl}/auth/me`, { withCredentials: true }),
    );
    this.currentUserSignal.set({
      id: me.id,
      email: me.email,
      firstName: me.firstName,
      lastName: me.lastName,
      adminUiMode: me.adminUiMode,
    });
    this.organizationsSignal.set(me.organizations);
    // Best-effort, never blocks auth on an IAP concern (IapService.configureForUser
    // already swallows its own errors) -- me.id becomes RevenueCat's
    // app_user_id, must match what the backend passes to
    // RevenueCatService.fetchSubscriber when confirming a purchase later.
    void this.iap.configureForUser(me.id);
  }

  /** Optimistic: the UI switches immediately, and reverts if the save fails. */
  async setAdminUiMode(adminUiMode: AdminUiMode): Promise<void> {
    const user = this.currentUserSignal();
    if (!user || user.adminUiMode === adminUiMode) {
      return;
    }
    this.currentUserSignal.set({ ...user, adminUiMode });
    try {
      await firstValueFrom(
        this.http.patch<MeResponse>(
          `${environment.apiUrl}/auth/me/preferences`,
          { adminUiMode },
          { withCredentials: true },
        ),
      );
    } catch {
      this.currentUserSignal.set(user);
    }
  }

  private rememberSession(refreshToken: string | undefined): void {
    writeStored(REFRESH_TOKEN_KEY, refreshToken ?? null);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.currentUserSignal.set(null);
    this.organizationsSignal.set([]);
  }
}
