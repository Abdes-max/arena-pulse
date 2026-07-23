import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Match/tournament statuses (docs/design/colors.md — "sports-statuses" tokens).
 * Sporting outcomes (win/loss/elimination) are deliberately kept separate from
 * system statuses (success/warning/error) so a defeat is never rendered as an
 * application error.
 */
export type BadgeStatus =
  | 'upcoming'
  | 'live'
  | 'finished'
  | 'postponed'
  | 'cancelled'
  | 'qualified'
  | 'eliminated'
  | 'draft'
  | 'published'
  | 'unpublished'
  | 'archived';

const DEFAULT_LABELS: Record<BadgeStatus, string> = {
  upcoming: 'À venir',
  live: 'En direct',
  finished: 'Terminé',
  postponed: 'Reporté',
  cancelled: 'Annulé',
  qualified: 'Qualifié',
  eliminated: 'Éliminé',
  draft: 'Brouillon',
  published: 'Publié',
  unpublished: 'Dépublié',
  archived: 'Archivé',
};

@Component({
  selector: 'ap-badge',
  imports: [],
  templateUrl: './badge.html',
  styleUrl: './badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-status]': 'status()',
  },
})
export class Badge {
  readonly status = input.required<BadgeStatus>();
  /** Overrides the default French label — the status itself always drives the visuals. */
  readonly label = input<string>();

  protected readonly resolvedLabel = computed(() => this.label() ?? DEFAULT_LABELS[this.status()]);
}
