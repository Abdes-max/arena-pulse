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
import { ThemeModeToggle } from 'design-system';
import { DEFAULT_THEME, ThemeMode, ThemeName, ThemeService } from 'design-tokens';
import { TournamentContextService } from '../core/tournament-context.service';
import { PublicTheme } from 'shared-models';

/** Maps the backend's PublicTheme enum to design-tokens' ThemeName (data-theme values). */
const THEME_MAP: Record<PublicTheme, ThemeName> = {
  INK_SIGNAL: 'ink-signal',
  PULSE_EMBER: 'pulse-ember',
  NEON_COURT: 'neon-court',
};

@Component({
  selector: 'app-tournament-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeModeToggle],
  providers: [TournamentContextService],
  templateUrl: './tournament-shell.html',
  styleUrl: './tournament-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentShell {
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly context = inject(TournamentContextService);

  protected readonly tournament = this.context.tournament;
  protected readonly loading = this.context.loading;
  protected readonly errorMessage = this.context.errorMessage;
  protected readonly mode = this.themeService.mode;

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  // index.html sets <base href="/">, so a plain href="#main-content" resolves
  // against that base (i.e. navigates to "/") instead of jumping within the
  // current route -- handled manually here instead.
  protected focusMainContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }

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

    // The tournament's own theme (organizer choice) governs the public site
    // and slideshow only — applied to <html> here, and reset back to the
    // fixed product identity on the way out so the landing page (and any
    // other route outside this shell) never inherits it. Light/dark mode is
    // a separate, user-toggled preference (see `mode`/`toggleMode` above)
    // that survives this theme swap in both directions.
    effect(() => {
      const tournament = this.tournament();
      if (!tournament) {
        return;
      }
      this.themeService.setTheme(document.documentElement, THEME_MAP[tournament.theme]);
    });

    this.destroyRef.onDestroy(() => {
      this.themeService.setTheme(document.documentElement, DEFAULT_THEME);
    });
  }
}
