import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, TextField } from 'design-system';
import { firstValueFrom } from 'rxjs';
import type {
  OrganizerRegistration,
  RegistrationPaymentStatus,
  RegistrationSettings,
  RegistrationStatus,
} from 'shared-models';
import { environment } from '../../../../environments/environment';
import { OrganizerAuthService } from '../../core/auth.service';

type Filter = 'PENDING' | 'CONFIRMED' | 'WAITLIST' | 'REJECTED' | 'ALL';

/**
 * Pre-registrations on the go -- app port of apps/web's admin Inscriptions
 * page: open/close the registrations, then confirm, refuse or wait-list each
 * request and tick the payment collected on site.
 */
@Component({
  selector: 'app-organizer-registrations-page',
  imports: [Button, IonContent, IonHeader, IonTitle, IonToolbar, TextField, TranslocoPipe],
  templateUrl: './registrations.page.html',
  styleUrl: './registrations.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerRegistrationsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly tournamentId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registrations = signal<OrganizerRegistration[]>([]);
  protected readonly settings = signal<RegistrationSettings | null>(null);
  protected readonly paymentInfo = signal('');
  protected readonly filter = signal<Filter>('PENDING');
  protected readonly filters: Filter[] = ['PENDING', 'CONFIRMED', 'WAITLIST', 'REJECTED', 'ALL'];
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectReason = signal('');

  protected readonly counts = computed(() => {
    const counts: Record<Filter, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      WAITLIST: 0,
      REJECTED: 0,
      ALL: 0,
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

  protected async goBack(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }

  private base(): string | null {
    const organizationId = this.auth.organizations()[0]?.id;
    return organizationId
      ? `${environment.apiUrl}/organizations/${organizationId}/tournaments/${this.tournamentId}/registrations`
      : null;
  }

  private filterOf(status: RegistrationStatus): Filter | null {
    if (status === 'PAID') {
      return 'CONFIRMED';
    }
    return status === 'PENDING' ||
      status === 'CONFIRMED' ||
      status === 'WAITLIST' ||
      status === 'REJECTED'
      ? status
      : null;
  }

  private async load(): Promise<void> {
    const base = this.base();
    if (!base) {
      this.loading.set(false);
      return;
    }
    try {
      const [registrations, settings] = await Promise.all([
        firstValueFrom(this.http.get<OrganizerRegistration[]>(base)),
        firstValueFrom(this.http.get<RegistrationSettings>(`${base}/settings`)),
      ]);
      this.registrations.set(registrations);
      this.settings.set(settings);
      this.paymentInfo.set(settings.paymentInfo ?? '');
      if (registrations.every((r) => r.status !== 'PENDING')) {
        this.filter.set('ALL');
      }
    } catch {
      this.errorMessage.set('organizer.registrations.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatAmount(registration: OrganizerRegistration): string | null {
    return registration.amountCents
      ? new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: registration.currency || 'eur',
        }).format(registration.amountCents / 100)
      : null;
  }

  protected async toggleOpen(event: Event): Promise<void> {
    await this.saveSettings({ open: (event.target as HTMLInputElement).checked });
  }

  protected onPaymentInfo(event: Event): void {
    this.paymentInfo.set((event.target as HTMLTextAreaElement).value);
  }

  protected async savePaymentInfo(): Promise<void> {
    await this.saveSettings({ paymentInfo: this.paymentInfo().trim() || null });
  }

  private async saveSettings(patch: {
    open?: boolean;
    paymentInfo?: string | null;
  }): Promise<void> {
    const base = this.base();
    if (base) {
      await this.run(async () =>
        this.settings.set(
          await firstValueFrom(this.http.patch<RegistrationSettings>(`${base}/settings`, patch)),
        ),
      );
    }
  }

  protected async decide(
    registration: OrganizerRegistration,
    action: 'confirm' | 'waitlist',
  ): Promise<void> {
    await this.post(`${registration.id}/${action}`, {});
  }

  protected startReject(registration: OrganizerRegistration): void {
    this.rejectReason.set('');
    this.rejectingId.set(registration.id);
  }

  protected async reject(registration: OrganizerRegistration): Promise<void> {
    await this.post(`${registration.id}/reject`, {
      reason: this.rejectReason().trim() || undefined,
    });
    this.rejectingId.set(null);
  }

  protected async setPayment(registration: OrganizerRegistration, event: Event): Promise<void> {
    const paymentStatus = (event.target as HTMLSelectElement).value as RegistrationPaymentStatus;
    const base = this.base();
    if (base) {
      await this.run(async () =>
        this.registrations.set(
          await firstValueFrom(
            this.http.patch<OrganizerRegistration[]>(`${base}/${registration.id}/payment`, {
              paymentStatus,
            }),
          ),
        ),
      );
    }
  }

  private async post(path: string, body: object): Promise<void> {
    const base = this.base();
    if (base) {
      await this.run(async () =>
        this.registrations.set(
          await firstValueFrom(this.http.post<OrganizerRegistration[]>(`${base}/${path}`, body)),
        ),
      );
    }
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
        typeof message === 'string' ? message : 'organizer.registrations.errors.save',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
