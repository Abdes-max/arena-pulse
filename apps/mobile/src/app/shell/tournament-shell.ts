import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DEFAULT_THEME, ThemeName, ThemeService } from 'design-tokens';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonTabBar,
  IonTabButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
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
    IonTitle,
    IonContent,
    IonTabBar,
    IonTabButton,
    IonButton,
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
  protected readonly cache = inject(OfflineCacheService);
  protected readonly context = inject(TournamentContextService);

  protected readonly tournament = this.context.tournament;
  protected readonly loading = this.context.loading;
  protected readonly errorMessage = this.context.errorMessage;
  protected readonly cachedAt = this.context.cachedAt;

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
    effect(() => {
      const tournament = this.tournament();
      if (!tournament) {
        return;
      }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.themeService.apply(
        document.documentElement,
        THEME_MAP[tournament.theme],
        prefersDark ? 'dark' : 'light',
      );
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

  protected retry(): void {
    void this.context.load(this.context.slug());
  }
}
