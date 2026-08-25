import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type TextFieldType =
  'text' | 'email' | 'password' | 'search' | 'tel' | 'number' | 'date' | 'datetime-local';

let nextId = 0;

function noop(): void {
  // Default ControlValueAccessor callback before Angular forms registers the real one.
}

@Component({
  selector: 'ap-text-field',
  imports: [],
  templateUrl: './text-field.html',
  styleUrl: './text-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-invalid]': 'errorMessage() ? true : null',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextField),
      multi: true,
    },
  ],
})
export class TextField implements ControlValueAccessor {
  readonly label = input.required<string>();
  /** Keeps the label in the DOM for screen readers but hides it visually — for compact filter bars. */
  readonly hideLabel = input(false);
  readonly type = input<TextFieldType>('text');
  readonly errorMessage = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);
  readonly placeholder = input<string | null>(null);
  readonly min = input<number | string | null>(null);
  /** type="number" only -- amount +/- steps by. */
  readonly step = input<number>(1);

  /**
   * Controlled-component inputs, for pages that render from plain signals
   * instead of Angular forms — used alongside (not instead of) the
   * ControlValueAccessor contract below, which reactive-forms consumers rely on.
   */
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  protected readonly inputId = `ap-text-field-${nextId++}`;
  protected readonly errorId = `${this.inputId}-error`;

  // Only trust cvaValue once Angular forms actually calls writeValue() -- a
  // controlled (non-form) consumer that clears its own signal after handling
  // valueChange (e.g. an "add then reset the field" form) must keep winning,
  // not get stuck on the last keystroke forever. Same fix as ap-select.
  private readonly isCvaBound = signal(false);
  private readonly cvaValue = signal('');
  protected readonly displayValue = computed(() =>
    this.isCvaBound() ? this.cvaValue() : this.value(),
  );
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = noop;
  private onTouched: () => void = noop;

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

  protected handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.setValue(value);
  }

  protected handleBlur(): void {
    this.onTouched();
  }

  /**
   * Native number-input spin buttons are hidden (see text-field.scss) since
   * they overlap the digit(s) in a narrow field -- these replace them,
   * rendered beside the input instead of inside it.
   */
  protected increment(): void {
    this.step_(this.step());
  }

  protected decrement(): void {
    this.step_(-this.step());
  }

  private step_(delta: number): void {
    const current = Number(this.displayValue());
    let next = (Number.isFinite(current) ? current : 0) + delta;
    const min = this.min();
    if (min !== null && next < Number(min)) {
      next = Number(min);
    }
    this.setValue(String(next));
  }

  private setValue(value: string): void {
    if (this.isCvaBound()) {
      this.cvaValue.set(value);
    }
    this.onChange(value);
    this.valueChange.emit(value);
  }
}
