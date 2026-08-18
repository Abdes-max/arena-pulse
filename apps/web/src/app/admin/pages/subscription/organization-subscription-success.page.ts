import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import { OrganizationSubscriptionStatus } from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';

// Fallback only: confirmSubscriptionPayment (called first, see load() below)
// verifies the payment directly against Stripe using the session_id already
// on this page's own URL, so it's normally resolved before this poll loop
// ever runs. Kept as a safety net for the rare case that call itself fails
// (a transient network error, Stripe briefly unavailable) -- the webhook
// might still land shortly after even then. Same pattern as
// tournament-publish-success.page.ts.
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

@Component({
  selector: 'app-organization-subscription-success-page',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './organization-subscription-success.page.html',
  styleUrl: './organization-subscription-success.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationSubscriptionSuccessPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly languageService = inject(LanguageService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);

  protected readonly loading = signal(true);
  protected readonly status = signal<OrganizationSubscriptionStatus | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    const sessionId = this.route.snapshot.queryParamMap.get('session_id');
    if (sessionId) {
      try {
        const status = await this.organizationsService.confirmSubscriptionPayment(
          organizationId,
          sessionId,
        );
        this.status.set(status);
        if (status.status === 'ACTIVE') {
          this.loading.set(false);
          return;
        }
      } catch {
        // Fall through to the poll loop below -- confirming ourselves
        // failed, but the webhook may still land shortly.
      }
    }
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      const status = await this.organizationsService.getSubscriptionStatus(organizationId);
      this.status.set(status);
      if (status.status === 'ACTIVE') {
        break;
      }
      if (attempt < MAX_POLL_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
    this.loading.set(false);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.languageService.language(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
