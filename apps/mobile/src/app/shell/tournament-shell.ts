import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DEFAULT_THEME, ThemeMode, ThemeName, ThemeService } from 'design-tokens';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTabBar,
  IonTabButton,
  IonToolbar,
} from '@ionic/angular/standalone';
import { AssetUrlService } from 'api-client';
import { ShareButton, ThemeModeToggle } from 'design-system';
import { PublicTheme } from 'shared-models';
import { environment } from '../../environments/environment';
import { FavoritesService } from '../core/favorites.service';
import { NotificationsService } from '../core/notifications.service';
import { OfflineCacheService } from '../core/offline-cache.service';
import { TournamentContextService } from '../core/tournament-context.service';

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

// This shell renders hardcoded French throughout (no Transloco/LanguageService
// wiring here yet, unlike apps/web's own TournamentShell) -- 'fr-FR' matches
// that existing convention rather than introducing a lone localized piece.
function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Maps the backend's PublicTheme enum to design-tokens' ThemeName (data-theme values). */
const THEME_MAP: Record<PublicTheme, ThemeName> = {
  INK_SIGNAL: 'ink-signal',
  PULSE_EMBER: 'pulse-ember',
  NEON_COURT: 'neon-court',
  FRESH_PITCH: 'fresh-pitch',
  CRIMSON_CHARGE: 'crimson-charge',
};

@Component({
  selector: 'app-tournament-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonContent,
    IonTabBar,
    IonTabButton,
    IonButton,
    ThemeModeToggle,
    ShareButton,
  ],
  providers: [TournamentContextService],
  templateUrl: './tournament-shell.html',
  styleUrl: './tournament-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentShell {
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly favorites = inject(FavoritesService);
  private readonly notifications = inject(NotificationsService);
  private readonly assetUrl = inject(AssetUrlService);
  protected readonly cache = inject(OfflineCacheService);
  protected readonly context = inject(TournamentContextService);

  protected readonly tournament = this.context.tournament;
  protected readonly loading = this.context.loading;
  protected readonly errorMessage = this.context.errorMessage;
  protected readonly cachedAt = this.context.cachedAt;
  protected readonly mode = this.themeService.mode;

  // Tracks whether the visitor has used the toggle -- once true, the theme
  // effect below stops overwriting mode from prefers-color-scheme on every
  // re-run (e.g. a realtime tournament refresh), so a manual choice sticks.
  private readonly modeManuallySet = signal(false);

  // The header is common to every tab (Tournoi/Équipes/Classements/Calendrier)
  // -- shares the tournament's own public URL rather than whichever sub-page
  // happens to be open, so the recipient always lands on the same place
  // regardless of where the visitor tapped Partager from.
  //
  // environment.webUrl, not window.location.origin: the native app runs
  // from its own internal origin (capacitor://localhost on iOS,
  // https://localhost on Android), never from the real public domain --
  // sharing window.location.origin there produced a capacitor://localhost/…
  // link, meaningless (and likely rejected) outside the app. apps/web's own
  // TournamentShell keeps window.location.origin: it's genuinely served
  // from the public domain, so there's nothing to substitute there.
  protected readonly shareUrl = computed(() => `${environment.webUrl}/${this.context.slug()}`);
  protected readonly shareText = computed(() => {
    const tournament = this.tournament();
    return tournament ? `Suivez ${tournament.name} sur TournArena` : '';
  });

  // Whether the uploaded header photo reads as visually light overall --
  // null until computeHeroLuminance (below) resolves, or if it fails. null
  // is treated as "dark" everywhere this is read -- same reasoning as
  // apps/web's own TournamentShell (white text over a darkened photo is the
  // one failure mode that was already safe before this existed).
  protected readonly heroLight = signal<boolean | null>(null);

  // A translucent scrim under the photo, not the bare image -- same
  // treatment as apps/web's own TournamentShell.headerBackgroundImage.
  protected headerBackgroundImage(
    url: string | null | undefined,
    light: boolean | null,
  ): string | null {
    const resolved = this.assetUrl.resolve(url ?? null);
    if (!resolved) {
      return null;
    }
    const scrim = light
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.15))'
      : 'linear-gradient(180deg, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.15))';
    return `${scrim}, url(${JSON.stringify(resolved)})`;
  }

  // Needed alongside the theme applied to <html> (see the constructor's
  // theme effect) -- that alone doesn't give just the hero the dark-mode
  // override it needs when a background photo is present, same reasoning as
  // apps/web's own TournamentShell.heroTheme.
  protected heroTheme(theme: PublicTheme): ThemeName {
    return THEME_MAP[theme];
  }

  /**
   * Downsamples the header photo to a tiny canvas and averages its perceived
   * luminance (ITU-R BT.601 weights) to decide whether heroLight should be
   * true -- same approach as apps/web's own TournamentShell. Best-effort:
   * any failure just leaves heroLight at its current value instead of
   * throwing, see heroLight's own comment.
   */
  private async computeHeroLuminance(url: string): Promise<void> {
    try {
      const image = await new Promise<HTMLImageElement>((resolvePromise, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolvePromise(img);
        img.onerror = () => reject(new Error('Failed to load header image'));
        img.src = url;
      });

      const size = 24;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.drawImage(image, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const averageLuminance = total / (data.length / 4);
      this.heroLight.set(averageLuminance > 150);
    } catch {
      // Left as-is -- see heroLight's own comment.
    }
  }

  protected readonly formattedDates = computed(() => {
    const tournament = this.tournament();
    if (!tournament?.startDate) {
      return null;
    }
    const startDate = capitalizeFirst(
      new Date(tournament.startDate).toLocaleDateString('fr-FR', DATE_FORMAT_OPTIONS),
    );
    // startDate itself carries no real time-of-day (always set at UTC
    // midnight by Général) -- firstMatchTime is the actual kickoff time,
    // appended right after the start date only when there's a real
    // schedule to read one from.
    const start = tournament.firstMatchTime
      ? `${startDate} à ${new Date(tournament.firstMatchTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : startDate;
    if (!tournament.endDate || tournament.endDate === tournament.startDate) {
      return start;
    }
    const end = capitalizeFirst(
      new Date(tournament.endDate).toLocaleDateString('fr-FR', DATE_FORMAT_OPTIONS),
    );
    // A plain hyphen, not an em/en dash -- see docs/design/content-guidelines.md.
    return `${start} - ${end}`;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const slug = params.get('slug');
      if (slug) {
        void this.context.load(slug);
      }
    });

    // The tournament's own theme (organizer choice) governs the mobile view
    // only -- applied to <html> here, and reset back to the fixed product
    // identity on the way out, same pattern as apps/web's TournamentShell.
    // Mode (light/dark) defaults to the system preference but only until the
    // visitor overrides it with the toggle -- see modeManuallySet.
    effect(() => {
      const tournament = this.tournament();
      if (!tournament) {
        return;
      }
      this.themeService.setTheme(document.documentElement, THEME_MAP[tournament.theme]);
      if (!this.modeManuallySet()) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.themeService.setMode(document.documentElement, prefersDark ? 'dark' : 'light');
      }
    });

    this.destroyRef.onDestroy(() => {
      this.themeService.apply(document.documentElement, DEFAULT_THEME, 'light');
    });

    // Re-sampled whenever the header photo itself changes (a fresh tournament
    // load, or the organizer swapping it) -- reset to null first rather than
    // leaving the previous photo's result showing while the new one loads.
    effect(() => {
      const url = this.tournament()?.headerBackgroundUrl;
      this.heroLight.set(null);
      if (url) {
        void this.computeHeroLuminance(this.assetUrl.resolve(url) ?? url);
      }
    });

    // Re-checks favorited teams' matches for this tournament whenever the
    // realtime stream ticks (see TournamentContextService.lastMatchEvent),
    // and once up front to establish a baseline without notifying on
    // pre-existing state -- see NotificationsService.
    effect(() => {
      const tournament = this.tournament();
      const slug = this.context.slug();
      this.context.lastMatchEvent();
      if (!tournament || !slug) {
        return;
      }
      void this.notifications.checkFavoriteUpdates(slug, this.favorites.favoritesFor(slug));
    });
  }

  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url ?? null);
  }

  protected retry(): void {
    void this.context.load(this.context.slug());
  }

  protected onModeChange(next: ThemeMode): void {
    this.modeManuallySet.set(true);
    this.themeService.setMode(document.documentElement, next);
  }
}
