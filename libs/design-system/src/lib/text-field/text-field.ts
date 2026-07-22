import { ChangeDetectionStrategy, Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type TextFieldType = 'text' | 'email' | 'password';

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
  readonly type = input<TextFieldType>('text');
  readonly errorMessage = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);

  protected readonly inputId = `ap-text-field-${nextId++}`;
  protected readonly errorId = `${this.inputId}-error`;

  protected readonly value = signal('');
  protected readonly disabled = signal(false);

  private onChange: (value: string) => void = noop;
  private onTouched: () => void = noop;

  writeValue(value: string): void {
    this.value.set(value ?? '');
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
    this.value.set(value);
    this.onChange(value);
  }

  protected handleBlur(): void {
    this.onTouched();
  }
}
