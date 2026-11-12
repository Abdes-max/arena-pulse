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
import { AssetUrlService } from 'api-client';
import { Button } from 'design-system';
import { LanguageService } from 'design-tokens';
import { toDataURL } from 'qrcode';
import { Venue } from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { TournamentDetail } from '../../core/models';
import { THEME_MAP } from '../../core/theme-map';
import { TournamentsService } from '../../core/tournaments.service';

const WIDTH = 1240;
const BAND_HEIGHT = 240;
const QR_SIZE = 480;
const POSTER_WIDTH = 900;

interface ThemeColors {
  band: string;
  title: string;
  accent: string;
  font: string;
}

/**
 * QR code to download or print as a small poster: a band in the
 * tournament's theme colors with its logo, name and organizer, the code,
 * venue and date, and optionally the tournament's poster underneath.
 * Drawn on a canvas so the downloaded PNG and the printed page are the same
 * image (uploads are same-origin in production, so the canvas stays exportable).
 */
@Component({
  selector: 'app-qr-poster-dialog',
  imports: [Button, TranslocoPipe],
  templateUrl: './qr-poster-dialog.html',
  styleUrl: './qr-poster-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrPosterDialog {
  readonly tournamentId = input.required<string>();
  /** Absolute public URL the code points to. */
  readonly url = input.required<string>();
  readonly closed = output<void>();

  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly tournament = signal<TournamentDetail | null>(null);
  private readonly venues = signal<Venue[]>([]);
  protected readonly withPoster = signal(false);
  protected readonly image = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const tournamentId = this.tournamentId();
      const organizationId = this.authService.organizations()[0]?.id;
      if (!organizationId) {
        return;
      }
      void Promise.all([
        this.tournamentsService.getTournament(organizationId, tournamentId),
        this.tournamentsService.listVenues(organizationId, tournamentId).catch(() => [] as Venue[]),
      ])
        .then(([tournament, venues]) => {
          this.venues.set(venues);
          this.tournament.set(tournament);
        })
        .catch(() => this.failed.set(true));
    });

    effect(() => {
      const tournament = this.tournament();
      const withPoster = this.withPoster();
      const url = this.url();
      if (!tournament) {
        return;
      }
      void this.compose(tournament, url, withPoster)
        .then((dataUrl) => this.image.set(dataUrl))
        .catch(() => this.failed.set(true));
    });
  }

  protected togglePoster(event: Event): void {
    this.withPoster.set((event.target as HTMLInputElement).checked);
  }

  protected fileName(): string {
    return `${this.tournament()?.slug ?? 'tournoi'}-qrcode.png`;
  }

  // Prints just the image, from a throwaway iframe.
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
      '<!doctype html><html><head><title></title><style>@page{margin:10mm}html,body{margin:0}img{display:block;width:100%;height:auto;max-height:100vh;object-fit:contain}</style></head><body></body></html>',
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

  private themeColors(tournament: TournamentDetail): ThemeColors {
    const probe = document.createElement('div');
    probe.setAttribute('data-theme', THEME_MAP[tournament.theme]);
    probe.setAttribute('data-mode', 'light');
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const read = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;
    const colors = {
      band: read('--ap-color-primary', '#0f172a'),
      title: read('--ap-color-on-primary', '#ffffff'),
      accent: read('--ap-color-signal', '#facc15'),
      font: read('--ap-font-heading', 'sans-serif'),
    };
    probe.remove();
    return colors;
  }

  private loadImage(src: string | null): Promise<HTMLImageElement | null> {
    if (!src) {
      return Promise.resolve(null);
    }
    return new Promise((resolvePromise) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolvePromise(img);
      img.onerror = () => resolvePromise(null);
      img.src = src;
    });
  }

  private dateLine(tournament: TournamentDetail): string | null {
    if (!tournament.startDate) {
      return null;
    }
    const lang = this.languageService.language();
    const format = (value: string) =>
      new Date(value).toLocaleDateString(lang, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    const start = format(tournament.startDate);
    const end = tournament.endDate ? format(tournament.endDate) : start;
    return end === start ? start : `${start} → ${end}`;
  }

  private async compose(
    tournament: TournamentDetail,
    url: string,
    withPoster: boolean,
  ): Promise<string> {
    const colors = this.themeColors(tournament);
    const [qr, logo, poster] = await Promise.all([
      this.loadImage(
        await toDataURL(url, {
          width: QR_SIZE,
          margin: 1,
          color: { dark: '#000000ff', light: '#ffffffff' },
        }),
      ),
      this.loadImage(this.assetUrl.resolve(tournament.logoUrl)),
      withPoster
        ? this.loadImage(this.assetUrl.resolve(tournament.posterUrl))
        : Promise.resolve(null),
    ]);
    const headingFont = colors.font;
    await Promise.all([
      document.fonts.load(`800 60px ${headingFont}`).catch(() => undefined),
      document.fonts.load(`600 30px ${headingFont}`).catch(() => undefined),
    ]);

    const venue = this.venues()[0];
    const venueLine = venue
      ? venue.address
        ? `${venue.name} - ${venue.address}`
        : venue.name
      : null;
    const dateLine = this.dateLine(tournament);
    const organizer = this.authService.organizations()[0]?.name ?? null;

    const posterHeight = poster
      ? Math.round((POSTER_WIDTH * poster.naturalHeight) / poster.naturalWidth)
      : 0;
    let height = BAND_HEIGHT + 50 + QR_SIZE + 30 + 44;
    height += (venueLine ? 40 : 0) + (dateLine ? 40 : 0) + 40;
    if (poster) {
      height += posterHeight + 40;
    }

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('no canvas');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, height);

    // Band: logo on the left, name (and organizer) centered in the rest.
    ctx.fillStyle = colors.band;
    ctx.fillRect(0, 0, WIDTH, BAND_HEIGHT);
    let textLeft = 40;
    if (logo) {
      const box = 170;
      const top = (BAND_HEIGHT - box) / 2;
      ctx.fillStyle = '#ffffff';
      this.roundRect(ctx, 40, top, box, box, 20);
      ctx.fill();
      const scale = Math.min((box - 20) / logo.naturalWidth, (box - 20) / logo.naturalHeight);
      const w = logo.naturalWidth * scale;
      const h = logo.naturalHeight * scale;
      ctx.drawImage(logo, 40 + (box - w) / 2, top + (box - h) / 2, w, h);
      textLeft = 40 + box + 30;
    }
    const textWidth = WIDTH - textLeft - 40;
    const textCenter = textLeft + textWidth / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const title = tournament.name.toUpperCase();
    const titleSize = this.fitText(ctx, title, textWidth, 64, `800 {size}px ${headingFont}`);
    ctx.fillStyle = colors.title;
    ctx.font = `800 ${titleSize}px ${headingFont}`;
    if (organizer) {
      ctx.fillText(title, textCenter, BAND_HEIGHT / 2 - 34);
      const subSize = this.fitText(
        ctx,
        organizer.toUpperCase(),
        textWidth,
        54,
        `800 {size}px ${headingFont}`,
      );
      ctx.font = `800 ${subSize}px ${headingFont}`;
      ctx.fillStyle = colors.accent;
      ctx.fillText(organizer.toUpperCase(), textCenter, BAND_HEIGHT / 2 + 40);
    } else {
      ctx.fillText(title, textCenter, BAND_HEIGHT / 2);
    }

    // QR code and the lines under it.
    let y = BAND_HEIGHT + 50;
    if (qr) {
      ctx.drawImage(qr, (WIDTH - QR_SIZE) / 2, y, QR_SIZE, QR_SIZE);
    }
    y += QR_SIZE + 30;
    ctx.fillStyle = '#111827';
    ctx.font = `600 32px ${headingFont}`;
    ctx.fillText(this.transloco.translate('admin.qrPoster.scan'), WIDTH / 2, y);
    y += 44;
    ctx.fillStyle = '#4b5563';
    ctx.font = `500 28px ${headingFont}`;
    if (venueLine) {
      ctx.fillText(this.ellipsize(ctx, venueLine, WIDTH - 120), WIDTH / 2, y);
      y += 40;
    }
    if (dateLine) {
      ctx.fillText(dateLine, WIDTH / 2, y);
      y += 40;
    }
    y += 20;

    if (poster) {
      ctx.drawImage(poster, (WIDTH - POSTER_WIDTH) / 2, y, POSTER_WIDTH, posterHeight);
    }
    return canvas.toDataURL('image/png');
  }

  private fitText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    start: number,
    font: string,
  ): number {
    let size = start;
    while (size > 24) {
      ctx.font = font.replace('{size}', String(size));
      if (ctx.measureText(text).width <= maxWidth) {
        break;
      }
      size -= 2;
    }
    return size;
  }

  private ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }
    let cut = text;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return `${cut}…`;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
