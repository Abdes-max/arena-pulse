import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

let nextId = 0;

function noop(): void {
  // Default ControlValueAccessor callback before Angular forms registers the real one.
}

/**
 * Supports two usages: a controlled component (value in, valueChange out)
 * for pages that render their filters from plain signals, and a
 * ControlValueAccessor (formControlName) for pages built on reactive forms
 * -- same dual contract as ap-text-field.
 */
export type SelectSize = 'md' | 'sm';

@Component({
  selector: 'ap-select',
  imports: [],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-size]': 'size()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Select),
      multi: true,
    },
  ],
})
export class Select implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly hideLabel = input(false);
  readonly options = input.required<SelectOption[]>();
  /** 'sm' for dense contexts (e.g. a data-entry table row) -- 'md' (default) elsewhere. */
  readonly size = input<SelectSize>('md');

  /**
   * Controlled-component inputs, for pages that render from plain signals
   * instead of Angular forms -- used alongside (not instead of) the
   * ControlValueAccessor contract below, which reactive-forms consumers rely on.
   */
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  /**
   * For "pick one, then snap back to the placeholder" selects (e.g. an
   * "+ Ajouter…" picker that fires an action on selection rather than
   * holding a persistent value) -- resets the native <select> back to its
   * first option right after emitting, so the same option can be picked
   * again and the control never visually "sticks" on the last choice.
   */
  readonly resetAfterSelect = input(false);

  protected readonly selectId = `ap-select-${nextId++}`;
  private readonly selectRef = viewChild<ElementRef<HTMLSelectElement>>('selectEl');

  // Only trust cvaValue once Angular forms actually calls writeValue() -- a
  // controlled (non-form) consumer that re-renders `value()` back to its own
  // signal after handling `valueChange` (e.g. resetting a picker to its
  // placeholder) must keep winning, not get stuck on the last emitted value.
  private readonly isCvaBound = signal(false);
  private readonly cvaValue = signal('');
  protected readonly displayValue = computed(() =>
    this.isCvaBound() ? this.cvaValue() : this.value(),
  );
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = noop;
  private onTouched: () => void = noop;

  constructor() {
    // Nothing to pick between: if exactly one non-disabled option exists
    // (ignoring a "Choisir…" placeholder, which is always disabled) and
    // nothing is selected yet, select it automatically instead of making
    // the user open the menu just to confirm the only choice available.
    // Re-runs as `options()` shrinks (e.g. assigning teams to a group one
    // by one) so the last remaining choice gets the same treatment.
    effect(() => {
      const selectable = this.options().filter((option) => !option.disabled);
      if (selectable.length !== 1 || this.displayValue() !== '') {
        return;
      }
      const onlyValue = selectable[0].value;
      if (onlyValue === '') {
        return;
      }
      if (this.isCvaBound()) {
        this.cvaValue.set(onlyValue);
        this.onChange(onlyValue);
      } else {
        this.valueChange.emit(onlyValue);
      }
    });
  }

  writeValue(value: string): void {
    this.isCvaBound.set(true);
    this.cvaValue.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected handleChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    if (this.isCvaBound()) {
      this.cvaValue.set(value);
    }
    this.onChange(value);
    this.valueChange.emit(value);
    if (this.resetAfterSelect()) {
      select.value = this.selectRef()?.nativeElement.options[0]?.value ?? '';
    }
  }

  protected handleBlur(): void {
    this.onTouched();
  }
}
