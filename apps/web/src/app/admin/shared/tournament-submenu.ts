import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Button } from 'design-system';

/**
 * The tab-style sub-navigation for a single tournament's admin pages
 * (Équipes/Arbitres/Structure/Calendrier/Scores/Classement/Inscriptions) --
 * shared across all of them (not just the tournament create/update form)
 * so a visitor can jump directly between sub-pages instead of going back
 * through the tournament form each time. `ap-button`'s `routerLink` input
 * highlights the active tab on its own (see design-system's Button).
 */
@Component({
  selector: 'app-tournament-submenu',
  imports: [Button],
  templateUrl: './tournament-submenu.html',
  styleUrl: './tournament-submenu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentSubmenu {
  readonly tournamentId = input.required<string>();
}
