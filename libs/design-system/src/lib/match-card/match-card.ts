import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Badge, BadgeStatus } from '../badge/badge';

export type MatchCardVariant = 'featured' | 'live' | 'upcoming' | 'result' | 'compact';

export interface MatchCardTeam {
  name: string;
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

  protected readonly showMeta = computed(() => !!this.competitionLabel() || !!this.venue());

  // One status badge, always shown, pinned to the card's top-right corner --
  // not folded into the meta row or footer, so it reads the same regardless
  // of whether a competitionLabel/venue/kickoff happens to be set.
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
