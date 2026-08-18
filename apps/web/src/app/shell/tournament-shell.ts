import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
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
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetUrl = inject(AssetUrlService);
  protected readonly context = inject(TournamentContextService);

  // Same mobile-only tab-centering behaviour as the admin's
  // TournamentSubmenu (apps/web/src/app/admin/shared/tournament-submenu.ts)
  // -- kept as its own private field (viewChild.required) rather than a
  // shared component, since the two navs render structurally different
  // markup (routerLink anchors here vs. there too, but a different set of
  // tabs/wrapper) and neither is reused by the other.
  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');

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

  // Mobile-only hamburger (< 720px, same breakpoint/pattern as the admin
  // shell's own AppShell -- see apps/web/src/app/admin/shell/app-shell.ts):
  // the language switcher, share button and theme toggle move from the
  // header row into this slide-down panel instead of crowding the row next
  // to the sport name/back button.
  protected readonly mobileMenuOpen = signal(false);

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

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

    // Same mobile-only tab-centering as TournamentSubmenu (admin) -- centers
    // whichever tab is active on first paint (e.g. a direct link or page
    // refresh landing on "Calendrier").
    afterNextRender(() => this.centerActiveTab());

    // Also re-centers on browser back/forward and on any other in-app
    // navigation to a tournament sub-page that didn't go through this nav's
    // own (click) handler below.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        // routerLinkActive updates the DOM asynchronously relative to this
        // event -- wait a tick so the active tab (and therefore its
        // position) is up to date before measuring it.
        setTimeout(() => this.centerActiveTab());
      });
  }

  // Bound to (click) on every tab below -- centers the tapped tab
  // immediately, without waiting for navigation/routerLinkActive to catch up
  // (centerActiveTab above is the fallback for centering that doesn't
  // originate from a click here, e.g. browser back/forward).
  protected centerTab(event: Event): void {
    this.center(event.currentTarget as HTMLElement);
  }

  private centerActiveTab(): void {
    const active = this.nav().nativeElement.querySelector<HTMLElement>(
      '.tournament-shell__nav-link--active',
    );
    if (active) {
      this.center(active);
    }
  }

  private center(target: HTMLElement): void {
    const container = this.nav().nativeElement;
    // Desktop fits all four tabs with nothing to scroll -- scrollWidth
    // equals clientWidth (no overflow), so there's nothing to center *into*
    // and this must stay a no-op there. Centering is a mobile-only
    // behaviour, not "every click, every viewport" (same rule as the
    // admin's TournamentSubmenu).
    if (container.scrollWidth <= container.clientWidth) {
      return;
    }
    // getBoundingClientRect + current scrollLeft rather than
    // target.offsetLeft: offsetLeft is relative to offsetParent, which isn't
    // necessarily this scroll container (nothing here sets `position`), so
    // it can't be trusted to land the tab in the middle of *this* row
    // specifically.
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset =
      targetRect.left -
      containerRect.left +
      container.scrollLeft -
      container.clientWidth / 2 +
      targetRect.width / 2;
    container.scrollTo({ left: offset, behavior: 'smooth' });
  }
}
