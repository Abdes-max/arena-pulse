import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IonSelect, IonSelectOption, IonToggle } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  NotificationPrefs,
  REMINDER_MINUTES_OPTIONS,
  ReminderMinutes,
} from '../../core/notification-settings.service';

/**
 * The notification controls, shared by the global settings and each favorite
 * team's own settings: a presentational form that reports what changed and
 * leaves storing it to the page.
 */
@Component({
  selector: 'app-notification-prefs-form',
  imports: [IonSelect, IonSelectOption, IonToggle, TranslocoPipe],
  templateUrl: './notification-prefs-form.html',
  styleUrl: './notification-prefs-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPrefsForm {
  readonly prefs = input.required<NotificationPrefs>();
  readonly prefsChange = output<Partial<NotificationPrefs>>();

  protected readonly minutesOptions = REMINDER_MINUTES_OPTIONS;

  protected toggle(
    key: 'enabled' | 'reminder' | 'started' | 'score' | 'result' | 'sound',
    event: Event,
  ): void {
    const checked = (event as CustomEvent<{ checked: boolean }>).detail.checked;
    this.prefsChange.emit({ [key]: checked });
  }

  protected setMinutes(event: Event): void {
    const value = Number((event as CustomEvent<{ value: unknown }>).detail.value);
    if ((REMINDER_MINUTES_OPTIONS as readonly number[]).includes(value)) {
      this.prefsChange.emit({ reminderMinutes: value as ReminderMinutes });
    }
  }
}
