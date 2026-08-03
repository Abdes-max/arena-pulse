import { HttpClient } from '@angular/common/http';
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
}

/**
 * Mirrors admin/core/auth.service.ts, but for the separate PlayerAccount
 * session (own token, own httpOnly refresh cookie scoped to
 * /api/v1/player-auth) -- see apps/api/src/player-auth and
 * docs/architecture/adr/0005-player-registration-and-payments.md. Kept as a
 * distinct service/signals rather than reusing AuthService so an organizer
 * browsing their own admin and registering as a player in another tab never
 * has one session clobber the other.
 */
@Injectable({ providedIn: 'root' })
export class PlayerAuthService {
  private readonly http = inject(HttpClient);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentPlayerSignal = signal<PlayerAccount | null>(null);

  readonly isAuthenticated = computed(() => this.accessToken() !== null);
  readonly currentPlayer = this.currentPlayerSignal.asReadonly();

  getAccessToken(): string | null {
    return this.accessToken();
  }

  async register(payload: PlayerRegisterPayload): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<PlayerTokenResponse>(
        `${environment.apiUrl}/player-auth/register`,
        payload,
        { withCredentials: true },
      ),
    );
    this.accessToken.set(response.accessToken);
    await this.loadProfile();
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<PlayerTokenResponse>(
        `${environment.apiUrl}/player-auth/login`,
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
        this.http.post<PlayerTokenResponse>(
          `${environment.apiUrl}/player-auth/refresh`,
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

  async logout(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.apiUrl}/player-auth/logout`,
          {},
          { withCredentials: true },
        ),
      );
    } finally {
      this.clearSession();
    }
  }

  private async loadProfile(): Promise<void> {
    const me = await firstValueFrom(
      this.http.get<PlayerAccount>(`${environment.apiUrl}/player-auth/me`, {
        withCredentials: true,
      }),
    );
    this.currentPlayerSignal.set(me);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.currentPlayerSignal.set(null);
  }
}
