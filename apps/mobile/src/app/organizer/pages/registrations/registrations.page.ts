import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Clipboard } from '@capacitor/clipboard';
import { Button, Logo, QrCode, ShareButton, TextField, shareMessage } from 'design-system';
import { firstValueFrom } from 'rxjs';
import type {
  OrganizerRegistration,
  RegistrationPaymentStatus,
  RegistrationSettings,
  RegistrationStatus,
} from 'shared-models';
import { environment } from '../../../../environments/environment';
import { OrganizerAuthService } from '../../core/auth.service';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';

type Filter = 'PENDING' | 'CONFIRMED' | 'WAITLIST' | 'REJECTED' | 'ALL';

/** What the registration settings need of a category: its places and price. */
interface RegistrationCategory {
  id: string;
  name: string;
  registrationFeeCents: number | null;
  maxTeams: number | null;
}

/**
 * Pre-registrations on the go -- app port of apps/web's admin Inscriptions
 * page: open/close the registrations, then confirm, refuse or wait-list each
 * request and tick the payment collected on site.
 */
@Component({
  selector: 'app-organizer-registrations-page',
  imports: [
    Logo,
    Button,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    QrCode,
    ShareButton,
    TextField,
    TranslocoPipe,
  ],
  templateUrl: './registrations.page.html',
  styleUrl: './registrations.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerRegistrationsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly tournamentId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);
  protected readonly registrations = signal<OrganizerRegistration[]>([]);
  protected readonly settings = signal<RegistrationSettings | null>(null);
  protected readonly paymentInfo = signal('');
  // Teams one team manager may register (1 unless raised).
  protected readonly maxTeams = signal('1');
  // Places and price per category (drafts; empty places = unlimited).
  protected readonly categories = signal<RegistrationCategory[]>([]);
  private readonly placesDrafts = signal<Record<string, string>>({});
  private readonly feeDrafts = signal<Record<string, string>>({});
  protected readonly filter = signal<Filter>('PENDING');
  protected readonly filters: Filter[] = ['PENDING', 'CONFIRMED', 'WAITLIST', 'REJECTED', 'ALL'];
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectReason = signal('');

  // The public sign-up page on the website (also opens in the app).
  protected readonly registrationUrl = computed(() => {
    const slug = this.settings()?.slug;
    return slug ? `${environment.webUrl}/${slug}/register` : '';
  });
  protected readonly linkCopied = signal(false);
  // Sent with the link (share sheet, or pasted from "Copier") so whoever
  // receives it knows what it's for.
  protected readonly registrationShareText = computed(() =>
    this.transloco.translate('organizer.registrations.link.shareText', {
      name: this.settings()?.name ?? '',
    }),
  );

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

  protected async goToPublish(): Promise<void> {
    await this.router.navigate(['/organizer/tournaments', this.tournamentId, 'edit'], {
      queryParams: { step: 5 },
    });
  }

  protected async copyLink(): Promise<void> {
    try {
      await Clipboard.write({
        string: shareMessage(this.registrationShareText(), this.registrationUrl()),
      });
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      // Clipboard refused: the link stays on screen, selectable by hand.
    }
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
      const [registrations, settings, categories] = await Promise.all([
        firstValueFrom(this.http.get<OrganizerRegistration[]>(base)),
        firstValueFrom(this.http.get<RegistrationSettings>(`${base}/settings`)),
        firstValueFrom(
          this.http.get<RegistrationCategory[]>(base.replace(/\/registrations$/, '/categories')),
        ),
      ]);
      this.registrations.set(registrations);
      this.settings.set(settings);
      this.paymentInfo.set(settings.paymentInfo ?? '');
      this.maxTeams.set(String(settings.maxTeamsPerRegistrant ?? 1));
      this.categories.set(categories);
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

  protected placesFor(categoryId: string): string {
    const draft = this.placesDrafts()[categoryId];
    if (draft !== undefined) {
      return draft;
    }
    const maxTeams = this.categories().find((c) => c.id === categoryId)?.maxTeams;
    return maxTeams ? String(maxTeams) : '';
  }

  protected setPlaces(categoryId: string, value: string): void {
    this.placesDrafts.update((drafts) => ({ ...drafts, [categoryId]: value }));
  }

  protected feeFor(categoryId: string): string {
    const draft = this.feeDrafts()[categoryId];
    if (draft !== undefined) {
      return draft;
    }
    const cents = this.categories().find((c) => c.id === categoryId)?.registrationFeeCents;
    return cents ? String(cents / 100) : '0';
  }

  protected setFee(categoryId: string, value: string): void {
    this.feeDrafts.update((drafts) => ({ ...drafts, [categoryId]: value }));
  }

  /** One price for every category (0 = free); per category in the options. */
  protected defaultFee(): string {
    const first = this.categories()[0];
    return first ? this.feeFor(first.id) : '0';
  }

  protected setDefaultFee(value: string): void {
    this.feeDrafts.set(Object.fromEntries(this.categories().map((c) => [c.id, value])));
  }

  protected async savePaymentInfo(): Promise<void> {
    await this.saveSettings({
      paymentInfo: this.paymentInfo().trim() || null,
      maxTeamsPerRegistrant: Math.min(50, Math.max(1, Math.floor(Number(this.maxTeams())) || 1)),
    });
    await this.saveCategories();
  }

  /** Only the categories whose places or price changed. */
  private async saveCategories(): Promise<void> {
    const base = this.base()?.replace(/\/registrations$/, '/categories');
    if (!base) {
      return;
    }
    for (const category of this.categories()) {
      const places = this.placesFor(category.id).trim();
      const maxTeams = places ? Math.max(1, Math.round(Number(places))) : null;
      const fee = Number(this.feeFor(category.id).replace(',', '.')) || 0;
      const registrationFeeCents = fee > 0 ? Math.round(fee * 100) : null;
      if (
        maxTeams === category.maxTeams &&
        registrationFeeCents === (category.registrationFeeCents || null)
      ) {
        continue;
      }
      await this.run(async () => {
        const updated = await firstValueFrom(
          this.http.patch<RegistrationCategory>(`${base}/${category.id}`, {
            maxTeams,
            registrationFeeCents,
            ...(registrationFeeCents ? { registrationFeeCurrency: 'eur' } : {}),
          }),
        );
        this.categories.update((list) =>
          list.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
        );
      });
    }
  }

  private async saveSettings(patch: {
    open?: boolean;
    paymentInfo?: string | null;
    maxTeamsPerRegistrant?: number;
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
