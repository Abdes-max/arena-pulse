import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
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
 * one exception -- worth the extra space, it's how the organizer jumps to
 * what a visitor actually sees for this tournament.
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
}
