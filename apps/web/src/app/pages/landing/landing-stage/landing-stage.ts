import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * The landing hero's right column: what a tournament looks like on match
 * day -- a live score, the pool table, a goal notification and the
 * registrations filling up. An illustration with sample teams, not live
 * data (the host marks it aria-hidden).
 */
@Component({
  selector: 'app-landing-stage',
  imports: [TranslocoPipe],
  templateUrl: './landing-stage.html',
  styleUrl: './landing-stage.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingStage {}
