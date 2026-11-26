import {
  detectMapsPlatform,
  venueDisplayLabel,
  venueMapsUrl,
  venueNavigationApps,
} from 'shared-models';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { DEFAULT_THEME, ThemeMode, ThemeName, ThemeService, preferredMode } from 'design-tokens';
import {
  ActionSheetController,
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
  private readonly router = inject(Router);
  // The registration form stands on its own: no tab bar under it.
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly onRegistration = computed(() =>
    /\/register(\/|$)/.test(this.url().split(/[?#]/)[0]),
  );
  private readonly actionSheet = inject(ActionSheetController);
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

  // The hero is always the night band, lit by the theme's own color (see
  // .tournament-shell__hero) -- same as apps/web's TournamentShell. The
  // organizer's own photo shows through it under a dark scrim; the stock
  // colored backgrounds (header-backgrounds/) are left out -- the theme's
  // touch stays light.
  protected headerBackgroundImage(url: string | null | undefined): string | null {
    if (!url || url.startsWith('/header-backgrounds/')) {
      return null;
    }
    const resolved = this.assetUrl.resolve(url);
    if (!resolved) {
      return null;
    }
    const scrim = 'linear-gradient(180deg, rgba(7, 11, 20, 0.72), rgba(7, 11, 20, 0.9))';
    return `${scrim}, url(${JSON.stringify(resolved)})`;
  }

  // Needed alongside the theme applied to <html> (see the constructor's
  // theme effect) -- that alone doesn't give just the hero the dark-mode
  // override it needs when a background photo is present, same reasoning as
  // apps/web's own TournamentShell.heroTheme.
  protected heroTheme(theme: PublicTheme): ThemeName {
    return THEME_MAP[theme];
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
        void this.context.load(slug).then(() => this.openFinishedOnStandings(slug));
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
        this.themeService.setMode(document.documentElement, preferredMode());
      }
    });

    this.destroyRef.onDestroy(() => {
      this.themeService.apply(document.documentElement, DEFAULT_THEME, preferredMode());
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
    this.themeService.setMode(document.documentElement, next, true);
  }

  /**
   * Tap on the header's venue: hands over to the phone's navigation app
   * (Plans on iOS, the Android chooser -- Maps, Waze... -- via geo:) or
   * Google Maps in a new tab on a computer. Same in the native app.
   */
  // Public pages are French-only in the app (same as their other labels).
  protected readonly venueMapsLabel = 'Ouvrir dans l’application de navigation';

  private async chooseNavigationApp(venue: {
    name: string;
    address: string | null;
  }): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: 'Ouvrir l’itinéraire avec',
      buttons: [
        ...venueNavigationApps(venue).map((app) => ({
          text: app.label,
          handler: () => {
            window.location.href = app.url;
          },
        })),
        { text: 'Annuler', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  // "Stade X, 13100 Aix-en-Provence" -- one link with the name, postcode and city.
  protected readonly venueLabel = venueDisplayLabel;

  protected openVenueInMaps(venue: { name: string; address: string | null }): void {
    const platform = detectMapsPlatform(navigator.userAgent, navigator.maxTouchPoints);
    if (platform === 'ios') {
      // No system "open with" chooser on iOS: offer the GPS apps ourselves.
      void this.chooseNavigationApp(venue);
      return;
    }
    const url = venueMapsUrl(venue, platform);
    if (platform === 'desktop') {
      window.open(url, '_blank', 'noopener');
    } else {
      window.location.href = url;
    }
  }

  /**
   * Opening a finished tournament (its home page) lands on Classement, which
   * then shows the final ranking -- once, when the tournament is entered:
   * the "Tournoi" tab stays reachable afterwards.
   */
  private openFinishedOnStandings(slug: string): void {
    const path = this.router.url.split(/[?#]/)[0];
    if (
      this.context.tournament()?.isFinished &&
      (path === `/${slug}` || path === `/${slug}/home`)
    ) {
      void this.router.navigate(['/', slug, 'standings'], { replaceUrl: true });
    }
  }
}
