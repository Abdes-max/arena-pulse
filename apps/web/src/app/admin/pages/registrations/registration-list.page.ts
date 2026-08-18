import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, BadgeStatus } from 'design-system';
import { LanguageService } from 'design-tokens';
import { OrganizerRegistration, RegistrationStatus } from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { RegistrationsService } from '../../core/registrations.service';

const STATUS_TO_BADGE: Record<RegistrationStatus, BadgeStatus> = {
  PAID: 'published',
  PENDING_PAYMENT: 'draft',
  CANCELLED: 'cancelled',
};

const STATUS_LABEL_KEYS: Record<RegistrationStatus, string> = {
  PAID: 'admin.registrationList.status.paid',
  PENDING_PAYMENT: 'admin.registrationList.status.pending',
  CANCELLED: 'admin.registrationList.status.cancelled',
};

@Component({
  selector: 'app-registration-list-page',
  imports: [Badge, TranslocoPipe],
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

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registrations = signal<OrganizerRegistration[]>([]);

  protected readonly statusBadge = STATUS_TO_BADGE;
  protected readonly language = this.languageService.language;

  constructor() {
    void this.load();
  }

  protected statusLabel(status: RegistrationStatus): string {
    return this.transloco.translate(STATUS_LABEL_KEYS[status], {}, this.language());
  }

  // Native Intl instead of Angular's DatePipe: DatePipe needs CLDR locale
  // data registered per-locale (registerLocaleData) to avoid an NG0701
  // "missing locale data" crash on anything but the app's default locale --
  // nothing in this app registers that today. toLocaleString needs no such
  // registration and works for all 6 supported languages out of the box,
  // same reasoning as formatDate()/formatAmount() in tournament-form.page.ts.
  protected formatRegisteredAt(iso: string): string {
    return new Date(iso).toLocaleString(this.language(), {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  protected formatAmount(registration: OrganizerRegistration): string {
    const lang = this.language();
    if (registration.amountCents === 0) {
      return this.transloco.translate('admin.registrationList.free', {}, lang);
    }
    return (registration.amountCents / 100).toLocaleString(lang, {
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
      this.errorMessage.set('admin.registrationList.errors.load');
    } finally {
      this.loading.set(false);
    }
  }
}
