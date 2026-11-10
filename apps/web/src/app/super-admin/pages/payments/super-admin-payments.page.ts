import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, Button, Select, SelectOption, TextField } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminPaymentRow } from '../../core/models';
import { SuperAdminFilterBar } from '../../shared/filter-bar';
import {
  isInPeriod,
  matchesText,
  PERIOD_OPTIONS,
  PeriodFilter,
  withAllOption,
} from '../../shared/list-filters';
import { queryFilter } from '../../shared/query-filter';

/** Same grouping as the status badges in the table. */
function statusGroup(status: string): 'paid' | 'pending' | 'other' {
  if (status === 'PAID' || status === 'ACTIVE') {
    return 'paid';
  }
  return status === 'PENDING_PAYMENT' ? 'pending' : 'other';
}

const TYPE_LABEL: Record<string, string> = {
  REGISTRATION: 'Inscription',
  PUBLICATION: 'Publication',
  SUBSCRIPTION: 'Abonnement',
};

@Component({
  selector: 'app-super-admin-payments-page',
  imports: [RouterLink, Badge, Button, Select, TextField, SuperAdminFilterBar],
  templateUrl: './super-admin-payments.page.html',
  styleUrl: './super-admin-payments.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminPaymentsPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly typeLabel = TYPE_LABEL;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly payments = signal<SuperAdminPaymentRow[]>([]);

  protected readonly annotatingId = signal<string | null>(null);
  protected readonly noteDraft = signal('');
  protected readonly saving = signal(false);

  protected readonly query = queryFilter('q', '');
  protected readonly type = queryFilter('type', '');
  protected readonly status = queryFilter('status', '');
  protected readonly organization = queryFilter('organization', '');
  protected readonly note = queryFilter('note', '');
  protected readonly period = queryFilter<PeriodFilter>('period', 'all');
  protected readonly from = queryFilter('from', '');
  protected readonly to = queryFilter('to', '');

  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly typeOptions: SelectOption[] = withAllOption(
    'Tous les types',
    Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
  );
  protected readonly statusOptions: SelectOption[] = [
    { value: '', label: 'Tous les statuts' },
    { value: 'paid', label: 'Payé' },
    { value: 'pending', label: 'En attente' },
    { value: 'other', label: 'Autre (annulé, remboursé…)' },
  ];
  protected readonly noteOptions: SelectOption[] = [
    { value: '', label: 'Avec ou sans note' },
    { value: 'with', label: 'Avec note' },
    { value: 'without', label: 'Sans note' },
  ];
  protected readonly organizationOptions = computed(() => {
    const byId = new Map(this.payments().map((p) => [p.organizationId, p.organizationName]));
    const options = [...byId].map(([value, label]) => ({ value, label }));
    options.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return withAllOption('Toutes les organisations', options);
  });

  protected readonly filtered = computed(() =>
    this.payments().filter(
      (payment) =>
        matchesText(this.query(), payment.organizationName, payment.note) &&
        (!this.type() || payment.type === this.type()) &&
        (!this.status() || statusGroup(payment.status) === this.status()) &&
        (!this.organization() || payment.organizationId === this.organization()) &&
        (!this.note() || !!payment.note === (this.note() === 'with')) &&
        isInPeriod(payment.paidAt ?? payment.createdAt, this.period(), this.from(), this.to()),
    ),
  );

  /** Sum of the visible rows that are actually collected, one entry per currency. */
  protected readonly collectedTotals = computed(() => {
    const byCurrency = new Map<string, number>();
    for (const payment of this.filtered()) {
      if (statusGroup(payment.status) === 'paid') {
        byCurrency.set(
          payment.currency,
          (byCurrency.get(payment.currency) ?? 0) + payment.amountCents,
        );
      }
    }
    return [...byCurrency].map(([currency, cents]) => ({ currency, cents }));
  });

  protected readonly filtersActive = computed(
    () =>
      !!(
        this.query() ||
        this.type() ||
        this.status() ||
        this.organization() ||
        this.note() ||
        this.period() !== 'all'
      ),
  );

  constructor() {
    void this.load();
  }

  protected resetFilters(): void {
    this.query.set('');
    this.type.set('');
    this.status.set('');
    this.organization.set('');
    this.note.set('');
    this.period.set('all');
    this.from.set('');
    this.to.set('');
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.payments.set(await this.superAdminService.listPayments());
    } catch {
      this.errorMessage.set('Impossible de charger les paiements.');
    } finally {
      this.loading.set(false);
    }
  }

  protected startAnnotating(payment: SuperAdminPaymentRow): void {
    this.annotatingId.set(payment.id);
    this.noteDraft.set(payment.note ?? '');
  }

  protected cancelAnnotating(): void {
    this.annotatingId.set(null);
    this.noteDraft.set('');
  }

  protected onNoteDraftChange(value: string): void {
    this.noteDraft.set(value);
  }

  protected async saveAnnotation(payment: SuperAdminPaymentRow): Promise<void> {
    const note = this.noteDraft().trim();
    if (!note || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      await this.superAdminService.annotatePayment(payment.type, payment.id, note);
      this.payments.update((payments) =>
        payments.map((p) => (p.id === payment.id ? { ...p, note } : p)),
      );
      this.cancelAnnotating();
    } catch {
      this.errorMessage.set("Impossible d'enregistrer cette note.");
    } finally {
      this.saving.set(false);
    }
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '-';
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
