import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface TabOption {
  value: string;
  label: string;
}

/**
 * A horizontal row of tabs for switching between filter values (e.g. a
 * category) inline, rather than opening a native <select> menu -- better
 * suited to touch than a dropdown, and always visible without an extra tap.
 * Not a routed tab-bar (see ap-button's routerLink + RouterLinkActive
 * pattern for that); this one just emits the chosen value.
 */
@Component({
  selector: 'ap-tabs',
  imports: [],
  templateUrl: './tabs.html',
  styleUrl: './tabs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tabs {
  readonly label = input.required<string>();
  readonly options = input.required<TabOption[]>();
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  protected select(value: string): void {
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }
}
