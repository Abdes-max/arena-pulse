import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { OrganizationSubscriptionStatus } from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';

// Same short-poll pattern as tournament-publish-success.page.ts: the Stripe
// webhook that confirms payment usually lands within a second or two of the
// checkout redirect landing here.
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

@Component({
  selector: 'app-organization-subscription-success-page',
  imports: [RouterLink],
  templateUrl: './organization-subscription-success.page.html',
  styleUrl: './organization-subscription-success.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationSubscriptionSuccessPage {
  private readonly authService = inject(AuthService);
  private readonly organizationsService = inject(OrganizationsService);

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
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
