import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { Button } from 'design-system';

/**
 * The tab-style sub-navigation for a single tournament's admin pages
 * (Général/Équipes/Arbitres/Structure/Calendrier/Scores/Classement/Inscriptions) --
 * shared across all of them (not just the tournament create/update form) so
 * a visitor can jump directly between sub-pages instead of going back
 * through the tournament form each time. Plain routerLink anchors (same
 * compact underline/pill treatment as the public site's own tournament nav)
 * rather than a row of `ap-button`s, which took up more horizontal space
 * than seven tabs can afford. The "Lien public" button on the right is the
 * one exception -- how the organizer jumps to what a visitor actually sees
 * for this tournament -- but icon-only (`.ap-sr-only` text for screen
 * readers) since even that one button crowded the row on a phone, where
 * seven scrollable tabs already compete for width.
 */
@Component({
  selector: 'app-tournament-submenu',
  imports: [RouterLink, RouterLinkActive, Button],
  templateUrl: './tournament-submenu.html',
  styleUrl: './tournament-submenu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentSubmenu {
  readonly tournamentId = input.required<string>();
  // Fetched by AppShell alongside the tournament's theme -- null while
  // loading or for a tournament-scoped route with nothing to link yet.
  readonly slug = input<string | null>(null);
  // The link only makes sense once there's something public to visit -- an
  // unpublished tournament's site 404s for a visitor.
  readonly published = input(false);

  protected readonly publicUrl = computed(() => {
    const slug = this.slug();
    return slug && this.published() ? `/${slug}` : null;
  });

  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly router = inject(Router);

  constructor() {
    // Centers whichever tab is active on first paint (e.g. a direct link or
    // page refresh landing on "Scores") -- afterNextRender rather than the
    // constructor body since offsetWidth/scrollTo need real layout, not
    // available yet during component construction.
    afterNextRender(() => this.centerActiveTab());

    // Also re-centers on browser back/forward and on any other in-app
    // navigation to a tournament sub-page that didn't go through this
    // menu's own (click) handler below.
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

  // Bound to (click) on every tab below -- mission ask: "à chaque fois qu'on
  // clique sur un onglet il faut le centrer pour pouvoir voir les onglets
  // autour". Centers the tapped tab immediately, without waiting for
  // navigation/routerLinkActive to catch up (centerActiveTab above is the
  // fallback for centering that doesn't originate from a click here, e.g.
  // browser back/forward).
  protected centerTab(event: Event): void {
    this.center(event.currentTarget as HTMLElement);
  }

  private centerActiveTab(): void {
    const active = this.nav().nativeElement.querySelector<HTMLElement>(
      '.tournament-submenu__link--active',
    );
    if (active) {
      this.center(active);
    }
  }

  private center(target: HTMLElement): void {
    const container = this.nav().nativeElement;
    // Desktop fits all seven tabs with nothing to scroll -- scrollWidth
    // equals clientWidth (no overflow), so there's nothing to center *into*
    // and this must stay a no-op there. Mission ask was explicit: centering
    // is a mobile-only behaviour, not "every click, every viewport".
    if (container.scrollWidth <= container.clientWidth) {
      return;
    }
    // getBoundingClientRect + current scrollLeft rather than
    // target.offsetLeft: offsetLeft is relative to offsetParent, which
    // isn't necessarily this scroll container (nothing here sets
    // `position`), so it can't be trusted to land the tab in the middle of
    // *this* row specifically.
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
