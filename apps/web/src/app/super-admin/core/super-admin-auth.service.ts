import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SuperAdminAccount } from './models';

interface SuperAdminTokenResponse {
  accessToken: string;
  expiresIn: number;
}

/**
 * Mirrors admin/core/auth.service.ts and core/player-auth.service.ts, but
 * for the SuperAdminAccount session (own token, own httpOnly refresh
 * cookie scoped to /api/v1/super-admin-auth) -- see
 * apps/api/src/super-admin-auth. Kept as a distinct service/signals rather
 * than reusing either of the other two, same rationale as
 * PlayerAuthService: this dashboard can be open in one tab while an
 * organizer session stays live in another, without either clobbering the
 * other. No register() here -- there is no self-signup path for this
 * account type (see apps/api/prisma/create-super-admin.ts).
 */
@Injectable({ providedIn: 'root' })
export class SuperAdminAuthService {
  private readonly http = inject(HttpClient);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentSuperAdminSignal = signal<SuperAdminAccount | null>(null);

  readonly isAuthenticated = computed(() => this.accessToken() !== null);
  readonly currentSuperAdmin = this.currentSuperAdminSignal.asReadonly();

  getAccessToken(): string | null {
    return this.accessToken();
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<SuperAdminTokenResponse>(
        `${environment.apiUrl}/super-admin-auth/login`,
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
        this.http.post<SuperAdminTokenResponse>(
          `${environment.apiUrl}/super-admin-auth/refresh`,
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
          `${environment.apiUrl}/super-admin-auth/logout`,
          {},
          { withCredentials: true },
        ),
      );
    } finally {
      this.clearSession();
    }
  }

  /** Permanent, immediate deletion (see SuperAdminAuthService.deleteAccount server-side) -- the caller is expected to redirect away right after this resolves. */
  async deleteAccount(password: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${environment.apiUrl}/super-admin-auth/me`, {
        body: { password },
        withCredentials: true,
      }),
    );
    this.clearSession();
  }

  private async loadProfile(): Promise<void> {
    const me = await firstValueFrom(
      this.http.get<SuperAdminAccount>(`${environment.apiUrl}/super-admin-auth/me`, {
        withCredentials: true,
      }),
    );
    this.currentSuperAdminSignal.set(me);
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.currentSuperAdminSignal.set(null);
  }
}
