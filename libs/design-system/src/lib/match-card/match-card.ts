import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Badge, BadgeStatus } from '../badge/badge';

export type MatchCardVariant = 'featured' | 'live' | 'upcoming' | 'result' | 'compact';

export interface MatchCardTeam {
  name: string;
  // Already resolved to a fetchable URL by the caller (shared-models'
  // resolveAssetUrl) -- this component doesn't know the app's own apiUrl.
  logoUrl?: string | null;
}

/**
 * Renders one match, but never the same way twice: the reference audit
 * flagged a single generic card reused for every context (poule, quart de
 * finale, finale) as a weakness (docs/product/opportunities.md). Arena
 * Pulse instead ships distinct treatments per variant (docs/design/
 * component-inventory.md) — `bracket-match`, `team-match-card` and
 * `match-summary` are deliberately out of scope for this foundation PR and
 * will be added alongside the screens that need them (feat/015 and later).
 */
@Component({
  selector: 'ap-match-card',
  imports: [Badge],
  templateUrl: './match-card.html',
  styleUrl: './match-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
  },
})
export class MatchCard {
  readonly variant = input<MatchCardVariant>('compact');
  readonly homeTeam = input.required<MatchCardTeam>();
  readonly awayTeam = input.required<MatchCardTeam>();
  readonly homeScore = input<number>();
  readonly awayScore = input<number>();
  readonly kickoff = input<string>();
  readonly venue = input<string>();
  readonly competitionLabel = input<string>();

  protected readonly hasScore = computed(
    () => this.homeScore() !== undefined && this.awayScore() !== undefined,
  );

  // One status badge, always shown, at the end of the meta row (pushed to
  // its right edge via margin-left: auto -- normal flow, not
  // position:absolute, so it can never overlap the score below it
  // regardless of how tall the badge actually renders).
  protected readonly statusBadge = computed<BadgeStatus>(() => {
    if (this.variant() === 'live') {
      return 'live';
    }
    return this.hasScore() ? 'finished' : 'upcoming';
  });

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
