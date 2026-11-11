import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, BadgeStatus, Button, TextField } from 'design-system';
import { LanguageService } from 'design-tokens';
import {
  OrganizerRegistration,
  RegistrationPaymentStatus,
  RegistrationSettings,
  RegistrationStatus,
} from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { RegistrationsService } from '../../core/registrations.service';
import { TournamentsService } from '../../core/tournaments.service';

const STATUS_TO_BADGE: Record<RegistrationStatus, BadgeStatus> = {
  PENDING: 'draft',
  CONFIRMED: 'published',
  WAITLIST: 'postponed',
  REJECTED: 'eliminated',
  CANCELLED: 'cancelled',
  PAID: 'published',
  PENDING_PAYMENT: 'draft',
};

type Filter = 'ALL' | 'PENDING' | 'CONFIRMED' | 'WAITLIST' | 'REJECTED';

/**
 * Pre-registrations of a tournament: the opening settings (open, dates,
 * payment details, card details) and every request, which the organizer
 * confirms, refuses or puts on the waiting list -- payment is collected by
 * the organizer and ticked here by hand.
 */
@Component({
  selector: 'app-registration-list-page',
  imports: [Badge, Button, TextField, TranslocoPipe],
  templateUrl: './registration-list.page.html',
  styleUrl: './registration-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly registrationsService = inject(RegistrationsService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registrations = signal<OrganizerRegistration[]>([]);
  protected readonly settings = signal<RegistrationSettings | null>(null);
  protected readonly filter = signal<Filter>('PENDING');
  protected readonly filters: Filter[] = ['PENDING', 'CONFIRMED', 'WAITLIST', 'REJECTED', 'ALL'];
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectReason = signal('');

  // Settings drafts
  protected readonly opensAt = signal('');
  protected readonly closesAt = signal('');
  protected readonly paymentInfo = signal('');
  protected readonly format = signal('');
  protected readonly level = signal('');

  protected readonly statusBadge = STATUS_TO_BADGE;

  protected readonly counts = computed(() => {
    const counts: Record<Filter, number> = {
      ALL: 0,
      PENDING: 0,
      CONFIRMED: 0,
      WAITLIST: 0,
      REJECTED: 0,
    };
    for (const registration of this.registrations()) {
      counts.ALL += 1;
      const key = this.filterOf(registration.status);
      if (key) {
        counts[key] += 1;
      }
    }
    return counts;
  });

  protected readonly visible = computed(() =>
    this.filter() === 'ALL'
      ? this.registrations()
      : this.registrations().filter((r) => this.filterOf(r.status) === this.filter()),
  );

  protected readonly individual = computed(() => this.settings()?.participantType === 'INDIVIDUAL');

  constructor() {
    void this.load();
  }

  private filterOf(status: RegistrationStatus): Filter | null {
    switch (status) {
      case 'PENDING':
        return 'PENDING';
      case 'CONFIRMED':
      case 'PAID':
        return 'CONFIRMED';
      case 'WAITLIST':
        return 'WAITLIST';
      case 'REJECTED':
        return 'REJECTED';
      default:
        return null;
    }
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    try {
      const [registrations, settings, tournament] = await Promise.all([
        this.registrationsService.listRegistrations(organizationId, this.tournamentId),
        this.registrationsService.getSettings(organizationId, this.tournamentId),
        this.tournamentsService.getTournament(organizationId, this.tournamentId),
      ]);
      this.registrations.set(registrations);
      this.applySettings(settings);
      this.format.set(tournament.format ?? '');
      this.level.set(tournament.level ?? '');
      if (registrations.every((r) => r.status !== 'PENDING')) {
        this.filter.set('ALL');
      }
    } catch {
      this.errorMessage.set('admin.registrationList.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  private applySettings(settings: RegistrationSettings): void {
    this.settings.set(settings);
    this.opensAt.set(settings.opensAt ? settings.opensAt.slice(0, 10) : '');
    this.closesAt.set(settings.closesAt ? settings.closesAt.slice(0, 10) : '');
    this.paymentInfo.set(settings.paymentInfo ?? '');
  }

  protected statusLabel(status: RegistrationStatus): string {
    return this.transloco.translate(
      `admin.registrationList.status.${status}`,
      {},
      this.languageService.language(),
    );
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.languageService.language(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected formatAmount(registration: OrganizerRegistration): string {
    if (!registration.amountCents) {
      return this.transloco.translate(
        'admin.registrationList.free',
        {},
        this.languageService.language(),
      );
    }
    return new Intl.NumberFormat(this.languageService.language(), {
      style: 'currency',
      currency: registration.currency || 'eur',
    }).format(registration.amountCents / 100);
  }

  protected onPaymentInfo(event: Event): void {
    this.paymentInfo.set((event.target as HTMLTextAreaElement).value);
  }

  protected async toggleOpen(event: Event): Promise<void> {
    await this.saveSettings({ open: (event.target as HTMLInputElement).checked });
  }

  protected async saveDetails(): Promise<void> {
    const organizationId = this.organization()?.id;
    await this.saveSettings({
      opensAt: this.opensAt() ? new Date(`${this.opensAt()}T00:00:00`).toISOString() : null,
      closesAt: this.closesAt() ? new Date(`${this.closesAt()}T23:59:59`).toISOString() : null,
      paymentInfo: this.paymentInfo().trim() || null,
    });
    if (organizationId) {
      await this.run(() =>
        this.tournamentsService.updateTournament(organizationId, this.tournamentId, {
          format: this.format().trim() || null,
          level: this.level().trim() || null,
        }),
      );
    }
  }

  private async saveSettings(
    patch: Partial<{
      open: boolean;
      opensAt: string | null;
      closesAt: string | null;
      paymentInfo: string | null;
    }>,
  ): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    await this.run(async () =>
      this.applySettings(
        await this.registrationsService.updateSettings(organizationId, this.tournamentId, patch),
      ),
    );
  }

  protected async confirm(registration: OrganizerRegistration): Promise<void> {
    await this.decide((org) =>
      this.registrationsService.confirm(org, this.tournamentId, registration.id),
    );
  }

  protected async waitlist(registration: OrganizerRegistration): Promise<void> {
    await this.decide((org) =>
      this.registrationsService.waitlist(org, this.tournamentId, registration.id),
    );
  }

  protected startReject(registration: OrganizerRegistration): void {
    this.rejectReason.set('');
    this.rejectingId.set(registration.id);
  }

  protected async reject(registration: OrganizerRegistration): Promise<void> {
    await this.decide((org) =>
      this.registrationsService.reject(
        org,
        this.tournamentId,
        registration.id,
        this.rejectReason().trim() || undefined,
      ),
    );
    this.rejectingId.set(null);
  }

  protected async setPayment(registration: OrganizerRegistration, event: Event): Promise<void> {
    const paymentStatus = (event.target as HTMLSelectElement).value as RegistrationPaymentStatus;
    await this.decide((org) =>
      this.registrationsService.setPayment(org, this.tournamentId, registration.id, paymentStatus),
    );
  }

  private async decide(
    action: (organizationId: string) => Promise<OrganizerRegistration[]>,
  ): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    await this.run(async () => this.registrations.set(await action(organizationId)));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      await action();
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse
          ? (error.error as { message?: unknown } | null)?.message
          : null;
      this.errorMessage.set(
        typeof message === 'string' ? message : 'admin.registrationList.errors.save',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
