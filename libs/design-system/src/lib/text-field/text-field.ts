import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type TextFieldType =
  'text' | 'email' | 'password' | 'search' | 'tel' | 'number' | 'date' | 'datetime-local' | 'time';

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
    '(keydown.escape)': 'closeCalendar()',
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
  /** Keeps the label in the DOM for screen readers but hides it visually -- for compact filter bars. */
  readonly hideLabel = input(false);
  readonly type = input<TextFieldType>('text');
  readonly errorMessage = input<string | null>(null);
  readonly autocomplete = input<string | null>(null);
  readonly placeholder = input<string | null>(null);
  readonly min = input<number | string | null>(null);
  /** type="number" only -- amount +/- steps by. */
  readonly step = input<number>(1);
  /**
   * type="date" / "time" / "datetime-local": keep the browser's own picker (the mobile app, where the
   * native date wheel is the better control) instead of the themed calendar.
   */
  readonly nativePicker = input(false);
  /** type="date" only -- accessible names for the calendar's buttons (French by default). */
  readonly clearLabel = input('Effacer');
  readonly previousMonthLabel = input('Mois précédent');
  readonly nextMonthLabel = input('Mois suivant');
  /** type="password" only -- the eye button's accessible names (French by default, like the stepper's). */
  readonly showPasswordLabel = input('Afficher le mot de passe');
  readonly hidePasswordLabel = input('Masquer le mot de passe');

  /** type="password" only -- toggled by the eye button, swaps the input to type="text". */
  protected readonly passwordVisible = signal(false);

  // ---- Themed date / time pickers (type="date", "time", "datetime-local") ----
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly calendarOpen = signal(false);
  // Opens toward the left when the field sits in the right half of the screen.
  protected readonly calendarAlignEnd = signal(false);
  // First day of the month on screen.
  protected readonly viewMonth = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  protected readonly hours = Array.from({ length: 24 }, (_, i) => pad(i));

  protected readonly themedPicker = computed(
    () =>
      !this.nativePicker() &&
      (this.type() === 'date' || this.type() === 'time' || this.type() === 'datetime-local'),
  );
  protected readonly showsCalendar = computed(() => this.type() !== 'time');
  protected readonly showsTime = computed(() => this.type() !== 'date');

  private lang(): string {
    return (typeof document !== 'undefined' && document.documentElement.lang) || 'fr';
  }

  /** The value's date part (YYYY-MM-DD), or ''. */
  private readonly datePart = computed(() =>
    this.type() === 'time' ? '' : (/^\d{4}-\d{2}-\d{2}/.exec(this.displayValue())?.[0] ?? ''),
  );
  /** The value's time part (HH:mm), or ''. */
  private readonly timePart = computed(() => {
    const value = this.displayValue();
    const time = this.type() === 'time' ? value : value.slice(11);
    return /^\d{2}:\d{2}/.exec(time)?.[0] ?? '';
  });
  protected readonly selectedHour = computed(() => this.timePart().slice(0, 2));
  protected readonly selectedMinute = computed(() => this.timePart().slice(3, 5));
  // Every 5 minutes, plus the current value's minute if it is in between.
  protected readonly minutes = computed(() => {
    const list = Array.from({ length: 12 }, (_, i) => pad(i * 5));
    const current = this.selectedMinute();
    return current && !list.includes(current) ? [...list, current].sort() : list;
  });

  protected readonly dateLabel = computed(() => {
    const date = parseIsoDate(this.datePart());
    const time = this.timePart();
    const dateText = date
      ? new Intl.DateTimeFormat(this.lang(), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(date)
      : null;
    switch (this.type()) {
      case 'time':
        return time || null;
      case 'datetime-local':
        return dateText ? (time ? `${dateText} · ${time}` : dateText) : null;
      default:
        return dateText;
    }
  });

  protected readonly monthLabel = computed(() => {
    const label = new Intl.DateTimeFormat(this.lang(), { month: 'long', year: 'numeric' }).format(
      this.viewMonth(),
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  // Monday-first initials, in the page's language.
  protected readonly weekdays = computed(() => {
    const format = new Intl.DateTimeFormat(this.lang(), { weekday: 'narrow' });
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
  });

  protected readonly todayLabel = computed(() => {
    const label = new Intl.RelativeTimeFormat(this.lang(), { numeric: 'auto' }).format(0, 'day');
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  protected readonly days = computed(() => {
    const month = this.viewMonth();
    const offset = (month.getDay() + 6) % 7;
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - offset);
    const selected = this.datePart();
    const today = toIsoDate(new Date());
    const min = typeof this.min() === 'string' ? (this.min() as string).slice(0, 10) : null;
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const iso = toIsoDate(date);
      return {
        iso,
        day: date.getDate(),
        inMonth: date.getMonth() === month.getMonth(),
        selected: iso === selected,
        today: iso === today,
        disabled: min !== null && iso < min,
      };
    });
  });

  protected toggleCalendar(event?: Event): void {
    if (this.disabled()) {
      return;
    }
    const trigger = event?.currentTarget as HTMLElement | undefined;
    if (trigger && typeof window !== 'undefined') {
      this.calendarAlignEnd.set(trigger.getBoundingClientRect().left > window.innerWidth / 2);
    }
    if (!this.calendarOpen()) {
      const date = parseIsoDate(this.datePart()) ?? new Date();
      this.viewMonth.set(new Date(date.getFullYear(), date.getMonth(), 1));
      // Brings the selected hour / minute into view in their columns.
      setTimeout(() => {
        for (const item of this.host.nativeElement.querySelectorAll<HTMLElement>(
          '.ap-text-field__time-item--selected',
        )) {
          item.parentElement?.scrollTo({ top: item.offsetTop - 64 });
        }
      });
    }
    this.calendarOpen.update((open) => !open);
  }

  protected closeCalendar(): void {
    if (this.calendarOpen()) {
      this.calendarOpen.set(false);
      this.onTouched();
    }
  }

  protected shiftMonth(delta: number): void {
    const month = this.viewMonth();
    this.viewMonth.set(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  protected pickDate(iso: string): void {
    if (this.type() === 'datetime-local') {
      // Keeps the time already chosen (9:00 by default) and stays open for it.
      this.setValue(`${iso}T${this.timePart() || '09:00'}`);
      return;
    }
    this.setValue(iso);
    this.closeCalendar();
  }

  protected pickToday(): void {
    this.pickDate(toIsoDate(new Date()));
  }

  protected pickHour(hour: string): void {
    this.setTime(`${hour}:${this.selectedMinute() || '00'}`);
  }

  protected pickMinute(minute: string): void {
    this.setTime(`${this.selectedHour() || '09'}:${minute}`);
    this.closeCalendar();
  }

  private setTime(time: string): void {
    if (this.type() === 'time') {
      this.setValue(time);
      return;
    }
    this.setValue(`${this.datePart() || toIsoDate(new Date())}T${time}`);
  }

  protected clearDate(event?: Event): void {
    event?.stopPropagation();
    this.setValue('');
    this.closeCalendar();
  }

  /**
   * Controlled-component inputs, for pages that render from plain signals
   * instead of Angular forms -- used alongside (not instead of) the
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

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
