import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MeResponse, OrganizationSummary, User } from './models';

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
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentUserSignal = signal<User | null>(null);
  private readonly organizationsSignal = signal<OrganizationSummary[]>([]);

  readonly isAuthenticated = computed(() => this.accessToken() !== null);
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly organizations = this.organizationsSignal.asReadonly();

  getAccessToken(): string | null {
    return this.accessToken();
  }

  /** No session is issued anymore -- the account stays unusable until the emailed link is clicked (see verifyEmail below). */
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

  /** Adopts a token issued outside the usual login flow (e.g. accepting an invitation as a brand-new account). */
  async applyAccessToken(accessToken: string): Promise<void> {
    this.accessToken.set(accessToken);
    await this.loadProfile();
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
  }

  private clearSession(): void {
    this.accessToken.set(null);
    this.currentUserSignal.set(null);
    this.organizationsSignal.set([]);
  }
}
