import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The tab-style sub-navigation for a single tournament's admin pages
 * (Général/Équipes/Arbitres/Structure/Calendrier/Scores/Classement/Inscriptions) --
 * shared across all of them (not just the tournament create/update form) so
 * a visitor can jump directly between sub-pages instead of going back
 * through the tournament form each time. Plain routerLink anchors (same
 * compact underline/pill treatment as the public site's own tournament nav)
 * rather than a row of `ap-button`s, which took up more horizontal space
 * than seven tabs can afford.
 */
@Component({
  selector: 'app-tournament-submenu',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './tournament-submenu.html',
  styleUrl: './tournament-submenu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentSubmenu {
  readonly tournamentId = input.required<string>();
}
