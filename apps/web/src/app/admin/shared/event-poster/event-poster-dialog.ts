import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AssetUrlService, PublicApiService } from 'api-client';
import { Button } from 'design-system';
import { LanguageService } from 'design-tokens';
import { toDataURL } from 'qrcode';
import { Venue } from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { Category, TournamentDetail } from '../../core/models';
import { THEME_MAP } from '../../core/theme-map';
import { TournamentsService } from '../../core/tournaments.service';
import { EventPosterContent, EventPosterStyle, drawEventPoster } from './event-poster-renderer';

// Meeting time suggested before the first match.
const MEETING_LEAD_MINUTES = 45;

type TextField = Exclude<keyof EventPosterContent, 'infos'>;

/** One editable input of the form: a poster text, or one line of an info cell. */
interface FormField {
  key: string;
  label: string;
}

interface Theme {
  primary: string;
  accent: string;
  onAccent: string;
  font: string;
}

/**
 * Promotional poster generator ("Affiche"): a ready-to-post 1080x1350 image
 * in the tournament's theme -- its header picture, signal color and heading
 * font -- with the category, organizer, date, key infos, price and venue.
 * Every text starts from the tournament's data and stays editable; drawing
 * is in event-poster-renderer.ts.
 */
@Component({
  selector: 'app-event-poster-dialog',
  imports: [Button, TranslocoPipe],
  templateUrl: './event-poster-dialog.html',
  styleUrl: './event-poster-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventPosterDialog {
  readonly tournamentId = input.required<string>();
  readonly closed = output<void>();

  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly publicApi = inject(PublicApiService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly content = signal<EventPosterContent | null>(null);
  /** On by default while registrations are open: the code then leads to the sign-up page. */
  protected readonly withQr = signal(false);
  protected readonly qrForRegistration = signal(false);
  private readonly images = signal<Pick<EventPosterStyle, 'background' | 'logo'> | null>(null);
  /** The organizer's own photo (players, their ground...), only in this browser. */
  private readonly photo = signal<HTMLImageElement | null>(null);
  protected readonly hasPhoto = signal(false);
  private readonly qrImage = signal<HTMLImageElement | null>(null);
  private theme: Theme | null = null;
  protected readonly image = signal<string | null>(null);
  protected readonly failed = signal(false);

  protected readonly textFields: FormField[] = [
    { key: 'title', label: 'admin.eventPoster.fields.title' },
    { key: 'category', label: 'admin.eventPoster.fields.category' },
    { key: 'organizer', label: 'admin.eventPoster.fields.organizer' },
    { key: 'date', label: 'admin.eventPoster.fields.date' },
    { key: 'price', label: 'admin.eventPoster.fields.price' },
    { key: 'end', label: 'admin.eventPoster.fields.end' },
    { key: 'venue', label: 'admin.eventPoster.fields.venue' },
    { key: 'city', label: 'admin.eventPoster.fields.city' },
  ];

  constructor() {
    effect(() => {
      const tournamentId = this.tournamentId();
      const organizationId = this.authService.organizations()[0]?.id;
      if (organizationId) {
        void this.load(organizationId, tournamentId).catch(() => this.failed.set(true));
      }
    });

    effect(() => {
      const tournament = this.tournament();
      const withQr = this.withQr();
      if (!tournament || !withQr) {
        this.qrImage.set(null);
        return;
      }
      const url = `${window.location.origin}/${tournament.slug}${this.qrForRegistration() ? '/register' : ''}`;
      void toDataURL(url, { width: 300, margin: 1 })
        .then((dataUrl) => loadImage(dataUrl))
        .then((img) => this.qrImage.set(img));
    });

    effect(() => {
      const content = this.content();
      const images = this.images();
      const qr = this.qrImage();
      const photo = this.photo();
      if (!content || !images || !this.theme) {
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        drawEventPoster(canvas, content, { ...this.theme, ...images, photo, qr });
        this.image.set(canvas.toDataURL('image/png'));
      } catch {
        this.failed.set(true);
      }
    });
  }

  protected value(key: string): string {
    const content = this.content();
    if (!content) {
      return '';
    }
    const [index, part] = key.split('.');
    return part ? content.infos[+index][part as 'title' | 'detail'] : content[key as TextField];
  }

  protected update(key: string, event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    const [index, part] = key.split('.');
    this.content.update((content) => {
      if (!content) {
        return content;
      }
      if (part) {
        const infos = content.infos.map((info, i) =>
          i === +index ? { ...info, [part]: text } : info,
        );
        return { ...content, infos };
      }
      return { ...content, [key]: text };
    });
  }

  protected async pickPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    this.photo.set(img);
    this.hasPhoto.set(!!img);
  }

  protected removePhoto(): void {
    this.photo.set(null);
    this.hasPhoto.set(false);
  }

  protected toggleQr(event: Event): void {
    this.withQr.set((event.target as HTMLInputElement).checked);
  }

  protected fileName(): string {
    return `${this.tournament()?.slug ?? 'tournoi'}-affiche.png`;
  }

  // Prints just the image, from a throwaway iframe (same as QrPosterDialog).
  protected print(): void {
    const image = this.image();
    if (!image) {
      return;
    }
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) {
      frame.remove();
      return;
    }
    doc.open();
    doc.write(
      '<!doctype html><html><head><title></title><style>@page{margin:8mm}html,body{margin:0}img{display:block;width:100%;height:auto;max-height:100vh;object-fit:contain}</style></head><body></body></html>',
    );
    doc.close();
    const img = doc.createElement('img');
    img.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    };
    img.src = image;
    doc.body.appendChild(img);
  }

  private async load(organizationId: string, tournamentId: string): Promise<void> {
    const tournament = await this.tournamentsService.getTournament(organizationId, tournamentId);
    const [venues, categories, firstMatchTime] = await Promise.all([
      this.tournamentsService.listVenues(organizationId, tournamentId).catch(() => [] as Venue[]),
      this.tournamentsService
        .listCategories(organizationId, tournamentId)
        .catch(() => [] as Category[]),
      // Only the public side works the first match out (drafts have no public page).
      this.publicApi
        .getTournament(tournament.slug)
        .then((t) => t.firstMatchTime)
        .catch(() => null),
    ]);
    this.theme = this.readTheme(tournament);
    await Promise.all([
      document.fonts.load(`900 60px ${this.theme.font}`).catch(() => undefined),
      document.fonts.load(`700 30px ${this.theme.font}`).catch(() => undefined),
    ]);
    const [background, logo] = await Promise.all([
      loadImage(this.assetUrl.resolve(tournament.headerBackgroundUrl)),
      loadImage(this.assetUrl.resolve(tournament.logoUrl)),
    ]);
    const registering = !!tournament.registrationsOpen && tournament.status === 'PUBLISHED';
    this.qrForRegistration.set(registering);
    this.withQr.set(registering);
    this.images.set({ background, logo });
    this.content.set(this.defaults(tournament, venues, categories, firstMatchTime));
    this.tournament.set(tournament);
  }

  private defaults(
    tournament: TournamentDetail,
    venues: Venue[],
    categories: Category[],
    firstMatchTime: string | null,
  ): EventPosterContent {
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(`admin.eventPoster.${key}`, params);
    const venue = venues[0];
    const fieldCount = venues.reduce((sum, v) => sum + v.fields.length, 0);
    const firstMatch = firstMatchTime ? new Date(firstMatchTime) : null;
    const meeting = firstMatch
      ? new Date(firstMatch.getTime() - MEETING_LEAD_MINUTES * 60_000)
      : null;
    const fees = categories.map((c) => c.registrationFeeCents ?? 0);
    const fee = fees.length > 0 ? Math.min(...fees) : 0;
    const currency = categories.find((c) => c.registrationFeeCurrency)?.registrationFeeCurrency;
    return {
      title: t(/^plateau/i.test(tournament.name) ? 'defaults.plateau' : 'defaults.tournament'),
      category: categories.map((c) => c.name).join(' / '),
      organizer: this.authService.organizations()[0]?.name ?? '',
      date: this.dateLine(tournament),
      infosHeading: t('infosHeading'),
      infos: [
        {
          icon: 'pin',
          title: t('defaults.meeting'),
          detail: meeting ? t('defaults.at', { time: this.time(meeting) }) : '',
        },
        {
          icon: 'ball',
          title: t('defaults.firstMatch'),
          detail: firstMatch ? t('defaults.at', { time: this.time(firstMatch) }) : '',
        },
        {
          icon: 'field',
          title: fieldCount > 0 ? t('defaults.fields', { count: fieldCount }) : '',
          detail: tournament.format ?? '',
        },
        {
          icon: 'rules',
          title: tournament.level ? t('defaults.level') : '',
          detail: tournament.level ?? '',
        },
      ],
      price:
        fee > 0
          ? new Intl.NumberFormat(this.languageService.language(), {
              style: 'currency',
              currency: (currency ?? 'eur').toUpperCase(),
              maximumFractionDigits: fee % 100 === 0 ? 0 : 2,
            }).format(fee / 100)
          : t('defaults.free'),
      endLabel: t('endLabel'),
      end: '',
      venue: venue?.name ?? '',
      city: cityOf(venue?.address ?? null),
      qrLabel: t(
        tournament.registrationsOpen && tournament.status === 'PUBLISHED'
          ? 'qrRegister'
          : 'qrFollow',
      ),
    };
  }

  // With the year: "11 NOVEMBRE 2026", "11 – 12 NOVEMBRE 2026".
  private dateLine(tournament: TournamentDetail): string {
    if (!tournament.startDate) {
      return '';
    }
    const lang = this.languageService.language();
    const start = new Date(tournament.startDate);
    const end = tournament.endDate ? new Date(tournament.endDate) : start;
    const full = (d: Date) =>
      d.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
    if (full(start) === full(end)) {
      return full(start);
    }
    const sameMonth =
      start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    return sameMonth
      ? `${start.toLocaleDateString(lang, { day: 'numeric' })} – ${full(end)}`
      : `${full(start)} – ${full(end)}`;
  }

  // "9H45" in French, the usual "9:45" elsewhere.
  private time(date: Date): string {
    const lang = this.languageService.language();
    const text = date.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' });
    return lang.startsWith('fr') ? text.replace(':', 'H') : text;
  }

  private readTheme(tournament: TournamentDetail): Theme {
    const probe = document.createElement('div');
    probe.setAttribute('data-theme', THEME_MAP[tournament.theme]);
    probe.setAttribute('data-mode', 'light');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const read = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;
    const theme = {
      primary: read('--ap-color-primary', '#0f172a'),
      accent: read('--ap-color-signal', '#facc15'),
      onAccent: read('--ap-color-on-signal', '#111111'),
      font: read('--ap-font-heading', 'sans-serif'),
    };
    probe.remove();
    return theme;
  }
}

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// "Rond-Point X, 13547 Aix-en-Provence, France" -> "Aix-en-Provence".
function cityOf(address: string | null): string {
  if (!address) {
    return '';
  }
  const postal = address.match(/\b\d{4,5}\s+([^,]+)/);
  if (postal) {
    return postal[1].trim();
  }
  const parts = address.split(',').map((part) => part.trim());
  return parts.length > 1 ? parts[parts.length - 2] : '';
}
