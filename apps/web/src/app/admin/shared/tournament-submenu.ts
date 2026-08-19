import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, QrCode } from 'design-system';
import { AuthService } from '../core/auth.service';
import { TournamentsService } from '../core/tournaments.service';

/**
 * The tab-style sub-navigation for a single tournament's admin pages
 * (Général/Équipes/Arbitres/Structure/Calendrier/Scores/Classement/Inscriptions) --
 * shared across all of them (not just the tournament create/update form) so
 * a visitor can jump directly between sub-pages instead of going back
 * through the tournament form each time. Plain routerLink anchors (same
 * compact underline/pill treatment as the public site's own tournament nav)
 * rather than a row of `ap-button`s, which took up more horizontal space
 * than seven tabs can afford. The "Partager" button on the right is the
 * exception -- a single icon-only trigger (`.ap-sr-only` text for screen
 * readers) opening a dropdown with the three ways an organizer reaches what
 * a visitor sees for this tournament (lien public, QR code, export PDF) --
 * three separate icon buttons used to sit here directly and crowded the row
 * on a phone, where seven scrollable tabs already compete for width.
 */
@Component({
  selector: 'app-tournament-submenu',
  imports: [RouterLink, RouterLinkActive, Button, TranslocoPipe, QrCode],
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
  // Small logo+name line above the tabs -- also fetched by AppShell
  // alongside the theme, already resolved to an absolute URL (or null).
  readonly name = input<string | null>(null);
  readonly logoUrl = input<string | null>(null);

  protected readonly publicUrl = computed(() => {
    const slug = this.slug();
    return slug && this.published() ? `/${slug}` : null;
  });

  // The QR code needs a full, scannable URL -- unlike publicUrl above,
  // which is only ever bound to an <a href> (resolved relative to the
  // current page by the browser itself, so a path-only value is fine
  // there), a code scanned by some other device has no "current page" to
  // resolve a relative path against.
  protected readonly publicAbsoluteUrl = computed(() => {
    const path = this.publicUrl();
    return path ? `${window.location.origin}${path}` : null;
  });

  protected readonly qrDialogOpen = signal(false);

  protected openQrDialog(): void {
    this.qrDialogOpen.set(true);
  }

  protected closeQrDialog(): void {
    this.qrDialogOpen.set(false);
  }

  // Lien public/QR code/Export PDF used to be three separate icon buttons
  // crowding this row -- consolidated into a single "Partager" trigger that
  // opens a small dropdown menu listing all three, same backdrop-button-
  // sibling pattern as the QR dialog itself (see that dialog's own comment
  // on why: a real <button>, not a clickable <div>, sibling rather than
  // parent of the panel).
  protected readonly shareMenuOpen = signal(false);

  protected toggleShareMenu(): void {
    this.shareMenuOpen.update((open) => !open);
  }

  protected closeShareMenu(): void {
    this.shareMenuOpen.set(false);
  }

  protected openQrDialogFromMenu(): void {
    if (!this.premiumUnlocked()) {
      return;
    }
    this.closeShareMenu();
    this.openQrDialog();
  }

  // Export PDF is a routerLink <a>, which has no native `disabled` --
  // navigation is blocked here instead when locked, same effect as the QR
  // button's own early return above.
  protected onExportPdfClick(event: Event): void {
    if (!this.premiumUnlocked()) {
      event.preventDefault();
      return;
    }
    this.closeShareMenu();
  }

  // QR code and export PDF are premium touches (see TournamentsService's
  // own hasPremiumFeatures doc comment on the API side) -- unlocked past a
  // team-count threshold or with an active org subscription. Fetched
  // whenever tournamentId changes rather than gated with a route guard: the
  // menu items stay visible either way (so the organizer *sees* what's
  // available once they grow their roster or subscribe) but are inert and
  // labeled with the unlock condition while locked.
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  protected readonly premiumUnlocked = signal(true);
  protected readonly freeMaxTeams = signal(8);

  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const tournamentId = this.tournamentId();
      const organizationId = this.authService.organizations()[0]?.id;
      if (!organizationId) {
        return;
      }
      void this.tournamentsService
        .getPremiumFeatures(organizationId, tournamentId)
        .then((status) => {
          this.premiumUnlocked.set(status.unlocked);
          this.freeMaxTeams.set(status.freeMaxTeams);
        })
        .catch(() => {
          // Read-only status check -- a transient failure just leaves the
          // previous (or default optimistic) state rather than blocking the
          // whole submenu on it.
        });
    });

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
