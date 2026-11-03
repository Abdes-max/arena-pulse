import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Badge, Button, TextField } from 'design-system';
import { DEFAULT_THEME, LanguageService, ThemeService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import {
  LaunchPromoStatus,
  OrganizationSubscriptionStatus,
  SubscriptionHistoryEntry,
} from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';

@Component({
  selector: 'app-organization-subscription-page',
  imports: [Badge, Button, TextField, TranslocoPipe],
  templateUrl: './organization-subscription.page.html',
  styleUrl: './organization-subscription.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationSubscriptionPage {
  private readonly organizationsService = inject(OrganizationsService);
  private readonly themeService = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly languageService = inject(LanguageService);
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

  // Launch offer code (TOURNARENA2026) -- see the API's
  // OrganizationsService.redeemLaunchPromo for what it unlocks.
  protected readonly launchPromo = signal<LaunchPromoStatus | null>(null);
  protected readonly promoCode = signal('');
  protected readonly redeemingPromo = signal(false);
  protected readonly promoError = signal<string | null>(null);

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
      this.errorMessage.set('admin.subscription.errors.loadStatus');
    } finally {
      this.loading.set(false);
    }
    void this.loadHistory();
    void this.loadLaunchPromo();
  }

  private async loadLaunchPromo(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || !this.isAdmin()) {
      return;
    }
    try {
      this.launchPromo.set(await this.organizationsService.getLaunchPromoStatus(organizationId));
    } catch {
      // Non-blocking, same as the history table: the code field still works.
    }
  }

  protected async redeemPromo(): Promise<void> {
    const organizationId = this.organization()?.id;
    const code = this.promoCode().trim();
    if (!organizationId || !code || this.redeemingPromo()) {
      return;
    }
    this.redeemingPromo.set(true);
    this.promoError.set(null);
    try {
      this.launchPromo.set(await this.organizationsService.redeemLaunchPromo(organizationId, code));
      this.promoCode.set('');
    } catch {
      this.promoError.set('admin.subscription.promo.invalid');
    } finally {
      this.redeemingPromo.set(false);
    }
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
      this.errorMessage.set('admin.subscription.errors.subscribe');
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
    return new Date(iso).toLocaleDateString(this.languageService.language(), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected formatAmount(amountCents: number, currency: string): string {
    return new Intl.NumberFormat(this.languageService.language(), {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  }
}
