import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PlayerAccount } from 'shared-models';
import { environment } from '../../environments/environment';

export interface PlayerRegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

interface PlayerTokenResponse {
  accessToken: string;
  expiresIn: number;
  /** Only present because every call below sends NATIVE_HEADERS. */
  refreshToken?: string;
}

// Same native mode as OrganizerAuthService: the refresh token comes back in
// the body and is kept in the app's own storage (the webview's cross-site
// cookie is not reliable on iOS). Its own key: an organizer and a team
// manager can be signed in side by side on one device.
const NATIVE_HEADERS = { 'X-Client': 'native' };
const REFRESH_TOKEN_KEY = 'tournarena.playerRefreshToken';

function readStored(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string | null | undefined): void {
  try {
    if (value) {
      localStorage.setItem(REFRESH_TOKEN_KEY, value);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    // Storage unavailable: the session just won't survive a restart.
  }
}

/**
 * The team manager's account (PlayerAccount, /api/v1/player-auth) in the
 * app -- same API as apps/web's PlayerAuthService, used to pre-register a
 * team and to open the manager's space.
 */
@Injectable({ providedIn: 'root' })
export class PlayerAuthService {
  private readonly http = inject(HttpClient);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentPlayerSignal = signal<PlayerAccount | null>(null);
  private refreshing: Promise<boolean> | null = null;

  readonly isAuthenticated = computed(() => this.accessToken() !== null);
  readonly currentPlayer = this.currentPlayerSignal.asReadonly();

  getAccessToken(): string | null {
    return this.accessToken();
  }

  async register(payload: PlayerRegisterPayload): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<PlayerTokenResponse>(`${environment.apiUrl}/player-auth/register`, payload, {
        withCredentials: true,
        headers: NATIVE_HEADERS,
      }),
    );
    await this.startSession(response);
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<PlayerTokenResponse>(
        `${environment.apiUrl}/player-auth/login`,
        { email, password },
        { withCredentials: true, headers: NATIVE_HEADERS },
      ),
    );
    await this.startSession(response);
  }

  /** Restores the session at startup from the stored refresh token (concurrent calls share one request: the token rotates). */
  silentRefresh(): Promise<boolean> {
    this.refreshing ??= this.doSilentRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async logout(): Promise<void> {
    const stored = readStored();
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.apiUrl}/player-auth/logout`,
          stored ? { refreshToken: stored } : {},
          { withCredentials: true },
        ),
      );
    } catch {
      // Signed out locally either way.
    } finally {
      writeStored(null);
      this.clearSession();
    }
  }

  private async doSilentRefresh(): Promise<boolean> {
    const stored = readStored();
    if (!stored) {
      return false;
    }
    try {
      const response = await firstValueFrom(
        this.http.post<PlayerTokenResponse>(
          `${environment.apiUrl}/player-auth/refresh`,
          { refreshToken: stored },
          { withCredentials: true, headers: NATIVE_HEADERS },
        ),
      );
      await this.startSession(response);
      return true;
    } catch (error) {
      // Only a rejected token ends the stored session; offline keeps it.
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        writeStored(null);
        this.clearSession();
      }
      return false;
    }
  }

  private async startSession(response: PlayerTokenResponse): Promise<void> {
    this.accessToken.set(response.accessToken);
    writeStored(response.refreshToken);
    const me = await firstValueFrom(
      this.http.get<PlayerAccount>(`${environment.apiUrl}/player-auth/me`),
    );
    this.currentPlayerSignal.set(me);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.currentPlayerSignal.set(null);
  }
}
