import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { IapService } from './iap.service';
import { MeResponse, OrganizationSummary, OrganizerUser } from './models';

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
  organizationName: string;
}

export interface RegisterResponse {
  status: 'PENDING_EMAIL_VERIFICATION';
  email: string;
}

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class OrganizerAuthService {
  private readonly http = inject(HttpClient);
  private readonly iap = inject(IapService);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentUserSignal = signal<OrganizerUser | null>(null);
  private readonly organizationsSignal = signal<OrganizationSummary[]>([]);

  readonly isAuthenticated = computed(() => this.accessToken() !== null);
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly organizations = this.organizationsSignal.asReadonly();

  getAccessToken(): string | null {
    return this.accessToken();
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
        { withCredentials: true },
      ),
    );
    this.accessToken.set(response.accessToken);
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

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(
        `${environment.apiUrl}/auth/login`,
        { email, password },
        { withCredentials: true },
      ),
    );
    this.accessToken.set(response.accessToken);
    await this.loadProfile();
  }

  /** Restores a session from the httpOnly refresh cookie on app startup. */
  async silentRefresh(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.http.post<TokenResponse>(
          `${environment.apiUrl}/auth/refresh`,
          {},
          { withCredentials: true },
        ),
      );
      this.accessToken.set(response.accessToken);
      await this.loadProfile();
      return true;
    } catch {
      this.clearSession();
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
    this.clearSession();
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true }),
      );
    } finally {
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
    });
    this.organizationsSignal.set(me.organizations);
    // Best-effort, never blocks auth on an IAP concern (IapService.configureForUser
    // already swallows its own errors) -- me.id becomes RevenueCat's
    // app_user_id, must match what the backend passes to
    // RevenueCatService.fetchSubscriber when confirming a purchase later.
    void this.iap.configureForUser(me.id);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.currentUserSignal.set(null);
    this.organizationsSignal.set([]);
  }
}
