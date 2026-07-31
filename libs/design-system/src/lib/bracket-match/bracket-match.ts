import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Badge } from '../badge/badge';

export interface BracketMatchTeam {
  name: string;
}

/**
 * Compact team-vs-team card sized for a bracket tree column rather than a
 * full-width list (see `ap-match-card`) — deliberately left out of the
 * design-system foundation until a screen needed it (feat/015's public
 * knockout bracket).
 */
@Component({
  selector: 'ap-bracket-match',
  imports: [Badge],
  templateUrl: './bracket-match.html',
  styleUrl: './bracket-match.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BracketMatch {
  readonly homeTeam = input.required<BracketMatchTeam>();
  readonly awayTeam = input.required<BracketMatchTeam>();
  readonly homeScore = input<number>();
  readonly awayScore = input<number>();
  readonly forfeitedTeamName = input<string>();

  protected readonly hasScore = computed(
    () => this.homeScore() !== undefined && this.awayScore() !== undefined,
  );

  protected readonly homeIsWinner = computed(() => {
    const home = this.homeScore();
    const away = this.awayScore();
    return home !== undefined && away !== undefined && home > away;
  });

  protected readonly awayIsWinner = computed(() => {
    const home = this.homeScore();
    const away = this.awayScore();
    return home !== undefined && away !== undefined && away > home;
  });
}
