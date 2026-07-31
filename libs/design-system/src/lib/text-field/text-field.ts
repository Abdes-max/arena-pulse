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

export type TextFieldType = 'text' | 'email' | 'password' | 'search';

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

  /**
   * Controlled-component inputs, for pages that render from plain signals
   * instead of Angular forms — used alongside (not instead of) the
   * ControlValueAccessor contract below, which reactive-forms consumers rely on.
   */
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  protected readonly inputId = `ap-text-field-${nextId++}`;
  protected readonly errorId = `${this.inputId}-error`;

  private readonly cvaValue = signal<string | null>(null);
  protected readonly displayValue = computed(() => this.cvaValue() ?? this.value());
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = noop;
  private onTouched: () => void = noop;

  writeValue(value: string): void {
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
    this.cvaValue.set(value);
    this.onChange(value);
    this.valueChange.emit(value);
  }

  protected handleBlur(): void {
    this.onTouched();
  }
}
