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

  protected select(value: string, event?: Event): void {
    if (event) {
      center(event.currentTarget as HTMLElement);
    }
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }
}

// Scrolls the tapped tab to the middle of the row, like the tournament's main
// tabs (apps/web TournamentShell.center) -- a no-op when every tab fits.
function center(tab: HTMLElement): void {
  const row = tab.parentElement;
  if (!row || row.scrollWidth <= row.clientWidth) {
    return;
  }
  const offset =
    tab.getBoundingClientRect().left -
    row.getBoundingClientRect().left -
    (row.clientWidth - tab.offsetWidth) / 2;
  row.scrollTo({ left: row.scrollLeft + offset, behavior: 'smooth' });
}
