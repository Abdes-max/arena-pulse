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
import { FavoritesService } from '../core/favorites.service';
import { NotificationsService } from '../core/notifications.service';
import { OfflineCacheService } from '../core/offline-cache.service';
import { TournamentContextService } from '../core/tournament-context.service';

/** Maps the backend's PublicTheme enum to design-tokens' ThemeName (data-theme values). */
const THEME_MAP: Record<PublicTheme, ThemeName> = {
  INK_SIGNAL: 'ink-signal',
  PULSE_EMBER: 'pulse-ember',
  NEON_COURT: 'neon-court',
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
  protected readonly shareUrl = computed(() => `${window.location.origin}/${this.context.slug()}`);
  protected readonly shareText = computed(() => {
    const tournament = this.tournament();
    return tournament ? `Suivez ${tournament.name} sur TournArena` : '';
  });

  protected readonly formattedDates = computed(() => {
    const tournament = this.tournament();
    if (!tournament?.startDate) {
      return null;
    }
    const start = new Date(tournament.startDate).toLocaleDateString('fr-FR');
    if (!tournament.endDate || tournament.endDate === tournament.startDate) {
      return start;
    }
    return `${start} – ${new Date(tournament.endDate).toLocaleDateString('fr-FR')}`;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const slug = params.get('slug');
      if (slug) {
        void this.context.load(slug);
      }
    });

    // The tournament's own theme (organizer choice) governs the mobile view
    // only — applied to <html> here, and reset back to the fixed product
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
