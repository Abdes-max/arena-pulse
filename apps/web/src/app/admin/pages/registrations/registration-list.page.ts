import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Badge, BadgeStatus } from 'design-system';
import { OrganizerRegistration, RegistrationStatus } from 'shared-models';
import { TournamentSubmenu } from '../../shared/tournament-submenu';
import { AuthService } from '../../core/auth.service';
import { RegistrationsService } from '../../core/registrations.service';

const STATUS_TO_BADGE: Record<RegistrationStatus, BadgeStatus> = {
  PAID: 'published',
  PENDING_PAYMENT: 'draft',
  CANCELLED: 'cancelled',
};

const STATUS_LABEL: Record<RegistrationStatus, string> = {
  PAID: 'Payée',
  PENDING_PAYMENT: 'En attente de paiement',
  CANCELLED: 'Annulée',
};

@Component({
  selector: 'app-registration-list-page',
  imports: [Badge, DatePipe, TournamentSubmenu],
  templateUrl: './registration-list.page.html',
  styleUrl: './registration-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly registrationsService = inject(RegistrationsService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registrations = signal<OrganizerRegistration[]>([]);

  protected readonly statusBadge = STATUS_TO_BADGE;
  protected readonly statusLabel = STATUS_LABEL;

  constructor() {
    void this.load();
  }

  protected formatAmount(registration: OrganizerRegistration): string {
    if (registration.amountCents === 0) {
      return 'Gratuit';
    }
    return (registration.amountCents / 100).toLocaleString('fr-FR', {
      style: 'currency',
      currency: registration.currency,
    });
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    try {
      this.registrations.set(
        await this.registrationsService.listRegistrations(organizationId, this.tournamentId),
      );
    } catch {
      this.errorMessage.set('Impossible de charger les inscriptions.');
    } finally {
      this.loading.set(false);
    }
  }
}
