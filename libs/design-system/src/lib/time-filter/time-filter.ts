import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type TimeFilterValue = '' | 'upcoming' | 'past';

/**
 * Two toggle buttons, "À venir" and "Passés", to filter a list of events by
 * date. Controlled (value in, valueChange out); pressing the active button
 * again clears the filter (value ''), so the list is never stuck on one side.
 */
@Component({
  selector: 'ap-time-filter',
  templateUrl: './time-filter.html',
  styleUrl: './time-filter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeFilter {
  /** Accessible name of the group (not displayed). */
  readonly label = input('Période');
  readonly upcomingLabel = input('À venir');
  readonly pastLabel = input('Passés');
  readonly value = input<TimeFilterValue>('');
  readonly valueChange = output<TimeFilterValue>();

  protected toggle(target: 'upcoming' | 'past'): void {
    this.valueChange.emit(this.value() === target ? '' : target);
  }
}
