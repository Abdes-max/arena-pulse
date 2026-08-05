import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type LogoVariant = 'on-light' | 'on-dark';

/**
 * The TournArena brand mark: a chevron (bracket progression) converging on
 * a pulsing dot (the same live-status motif as ap-badge[status="live"]).
 * Colors and font are hardcoded, not sourced from the --ap-* theme tokens
 * on purpose -- unlike UI accents, the brand mark must stay the same
 * regardless of which of the 3 selectable themes the organizer has picked
 * for their own admin view (see docs/design/logo.md).
 */
@Component({
  selector: 'ap-logo',
  imports: [],
  templateUrl: './logo.html',
  styleUrl: './logo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-variant]': 'variant()',
  },
})
export class Logo {
  readonly variant = input<LogoVariant>('on-light');
  /** Set false for the icon alone (e.g. a tight nav-bar slot). */
  readonly wordmark = input(true);
}
