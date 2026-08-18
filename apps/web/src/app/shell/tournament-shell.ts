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
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageSwitcher, ShareButton, ThemeModeToggle } from 'design-system';
import {
  DEFAULT_THEME,
  LanguageCode,
  LanguageService,
  SUPPORTED_LANGUAGES,
  ThemeMode,
  ThemeName,
  ThemeService,
} from 'design-tokens';
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
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ThemeModeToggle,
    ShareButton,
    LanguageSwitcher,
    TranslocoPipe,
  ],
  providers: [TournamentContextService],
  templateUrl: './tournament-shell.html',
  styleUrl: './tournament-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentShell {
  private readonly route = inject(ActivatedRoute);
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetUrl = inject(AssetUrlService);
  protected readonly context = inject(TournamentContextService);

  protected readonly tournament = this.context.tournament;
  protected readonly loading = this.context.loading;
  // A Transloco *key* (e.g. 'shell.error.notFound'), not the translated
  // string itself -- TournamentContextService has no reason to depend on
  // Transloco, and resolving the key in the template (| transloco) instead
  // of here keeps the message reactive to a language switch instead of
  // freezing whatever was active at the moment the fetch failed.
  protected readonly errorMessage = this.context.errorMessage;
  protected readonly mode = this.themeService.mode;
  protected readonly language = this.languageService.language;
  protected readonly languages = SUPPORTED_LANGUAGES;

  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url ?? null);
  }

  // The header is common to every tab (Tournoi/Équipes/Classement/Calendrier)
  // -- shares the tournament's own public URL rather than whichever sub-page
  // happens to be open, so the recipient always lands on the same place
  // regardless of where the visitor clicked Partager from.
  protected readonly shareUrl = computed(() => `${window.location.origin}/${this.context.slug()}`);
  // translate() (a plain synchronous lookup), not the `transloco` pipe --
  // this feeds ap-share-button's [text] input, a plain string property, not
  // template-bound markup, so there's no pipe to bind it through. Recomputed
  // whenever the tournament OR the active language signal changes, so a
  // language switch mid-visit updates the share text without needing to
  // reopen the share sheet twice.
  protected readonly shareText = computed(() => {
    const tournament = this.tournament();
    if (!tournament) {
      return '';
    }
    return this.transloco.translate('shell.shareText', { name: tournament.name }, this.language());
  });

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  protected onLanguageChange(code: string): void {
    this.languageService.setLanguage(code as LanguageCode);
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
    const start = new Date(tournament.startDate).toLocaleDateString(this.language());
    if (!tournament.endDate || tournament.endDate === tournament.startDate) {
      return start;
    }
    return `${start} – ${new Date(tournament.endDate).toLocaleDateString(this.language())}`;
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
