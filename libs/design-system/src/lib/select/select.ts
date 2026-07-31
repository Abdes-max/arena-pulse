import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface SelectOption {
  value: string;
  label: string;
}

let nextId = 0;

/**
 * Controlled select (value in, valueChange out) rather than a
 * ControlValueAccessor — the pages that need this render their filters from
 * plain signals, not reactive forms.
 */
@Component({
  selector: 'ap-select',
  imports: [],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Select {
  readonly label = input.required<string>();
  readonly hideLabel = input(false);
  readonly value = input<string>('');
  readonly options = input.required<SelectOption[]>();
  readonly valueChange = output<string>();

  protected readonly selectId = `ap-select-${nextId++}`;

  protected handleChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
