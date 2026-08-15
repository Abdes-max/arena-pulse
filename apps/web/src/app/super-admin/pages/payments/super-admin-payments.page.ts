import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, Button, TextField } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminPaymentRow } from '../../core/models';

const TYPE_LABEL: Record<string, string> = {
  REGISTRATION: 'Inscription',
  PUBLICATION: 'Publication',
  SUBSCRIPTION: 'Abonnement',
};

@Component({
  selector: 'app-super-admin-payments-page',
  imports: [RouterLink, Badge, Button, TextField],
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

  constructor() {
    void this.load();
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
