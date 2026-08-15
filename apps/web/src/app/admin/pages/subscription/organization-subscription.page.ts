import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Badge, Button } from 'design-system';
import { DEFAULT_THEME, ThemeService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import { OrganizationSubscriptionStatus, SubscriptionHistoryEntry } from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';

@Component({
  selector: 'app-organization-subscription-page',
  imports: [Badge, Button],
  templateUrl: './organization-subscription.page.html',
  styleUrl: './organization-subscription.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationSubscriptionPage {
  private readonly organizationsService = inject(OrganizationsService);
  private readonly themeService = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authService = inject(AuthService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly isAdmin = computed(() => this.organization()?.role === 'ORG_ADMIN');

  protected readonly loading = signal(true);
  protected readonly subscribing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly status = signal<OrganizationSubscriptionStatus | null>(null);

  protected readonly history = signal<SubscriptionHistoryEntry[]>([]);
  protected readonly historyLoading = signal(true);
  protected readonly printingEntry = signal<SubscriptionHistoryEntry | null>(null);

  constructor() {
    void this.load();

    // Same fixed-brand-identity pattern as collaborators.page.ts -- this
    // page isn't tied to a tournament's own theme.
    this.themeService.setTheme(document.documentElement, DEFAULT_THEME);
    this.destroyRef.onDestroy(() => {
      this.themeService.setTheme(document.documentElement, this.themeService.adminTheme());
    });
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      this.historyLoading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      this.status.set(await this.organizationsService.getSubscriptionStatus(organizationId));
    } catch {
      this.errorMessage.set("Impossible de charger l'état de l'abonnement.");
    } finally {
      this.loading.set(false);
    }
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.historyLoading.set(false);
      return;
    }
    this.historyLoading.set(true);
    try {
      this.history.set(await this.organizationsService.listSubscriptionHistory(organizationId));
    } catch {
      // Non-blocking: the current status above is the important bit, the
      // history table below just stays empty on failure.
    } finally {
      this.historyLoading.set(false);
    }
  }

  protected async subscribe(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || this.subscribing()) {
      return;
    }
    this.subscribing.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.organizationsService.subscribe(organizationId);
      if (result.status === 'PENDING_PAYMENT') {
        window.location.href = result.checkoutUrl;
        return;
      }
      this.status.set(result);
      void this.loadHistory();
    } catch {
      this.errorMessage.set("Impossible de souscrire à l'abonnement, réessayez.");
    } finally {
      this.subscribing.set(false);
    }
  }

  /** Renders the print-only receipt block for this entry, then opens the browser's print dialog. */
  protected printReceipt(entry: SubscriptionHistoryEntry): void {
    this.printingEntry.set(entry);
    const reset = () => {
      this.printingEntry.set(null);
      window.removeEventListener('afterprint', reset);
    };
    window.addEventListener('afterprint', reset);
    // Deferred a tick so Angular renders the print-only block before the
    // print dialog captures the page.
    setTimeout(() => window.print(), 0);
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected formatAmount(amountCents: number, currency: string): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  }
}
