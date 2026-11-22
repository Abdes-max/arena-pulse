import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, BadgeStatus, Button, ShareButton, TextField } from 'design-system';
import { LanguageService } from 'design-tokens';
import {
  OrganizerRegistration,
  RegistrationPaymentStatus,
  RegistrationSettings,
  RegistrationStatus,
} from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { RegistrationsService } from '../../core/registrations.service';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';
import { QrPosterDialog } from '../../shared/qr-poster-dialog/qr-poster-dialog';

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
 * Pre-registrations of a tournament: every request, which the organizer
 * confirms, refuses or puts on the waiting list (the settings are in
 * Général) -- payment is collected by
 * the organizer and ticked here by hand.
 *
 * A block of the Équipes tab (TeamListPage), shown only while the
 * tournament takes registrations: confirming a request creates its team,
 * so it tells the page to refresh the team list (teamsChanged).
 */
@Component({
  selector: 'app-registrations-block',
  imports: [Badge, Button, QrPosterDialog, RouterLink, ShareButton, TextField, TranslocoPipe],
  templateUrl: './registration-list.page.html',
  styleUrl: './registration-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly registrationsService = inject(RegistrationsService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  /** A confirmed request just became a team. */
  readonly teamsChanged = output<void>();

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);
  protected readonly registrations = signal<OrganizerRegistration[]>([]);
  protected readonly settings = signal<RegistrationSettings | null>(null);
  protected readonly filter = signal<Filter>('PENDING');
  protected readonly filters: Filter[] = ['PENDING', 'CONFIRMED', 'WAITLIST', 'REJECTED', 'ALL'];
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectReason = signal('');

  protected readonly statusBadge = STATUS_TO_BADGE;

  // The public sign-up page, absolute since it is handed out of the site.
  protected readonly registrationUrl = computed(() => {
    const slug = this.settings()?.slug;
    return slug ? `${window.location.origin}/${slug}/register` : '';
  });
  protected readonly linkCopied = signal(false);
  protected readonly qrOpen = signal(false);

  protected readonly individual = computed(() => this.settings()?.participantType === 'INDIVIDUAL');

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
      const [registrations, settings] = await Promise.all([
        this.registrationsService.listRegistrations(organizationId, this.tournamentId),
        this.registrationsService.getSettings(organizationId, this.tournamentId),
      ]);
      this.registrations.set(registrations);
      this.settings.set(settings);
      if (registrations.every((r) => r.status !== 'PENDING')) {
        this.filter.set('ALL');
      }
    } catch {
      this.errorMessage.set('admin.registrationList.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.registrationUrl());
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      // Clipboard refused (permissions): the field stays selectable by hand.
    }
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

  protected async confirm(registration: OrganizerRegistration): Promise<void> {
    await this.decide((org) =>
      this.registrationsService.confirm(org, this.tournamentId, registration.id),
    );
    this.teamsChanged.emit();
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
