import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

export interface AutocompleteSuggestion {
  label: string;
  /** Optional second, muted line (e.g. the rest of an address). */
  detail?: string;
  /**
   * Optional small image before the text (e.g. a club crest). null keeps
   * the slot empty so labels stay aligned with suggestions that have one.
   */
  imageUrl?: string | null;
}

let nextId = 0;

/**
 * Text field with a suggestion list underneath (ARIA combobox) -- purely
 * presentational: the page owns the query (valueChange) and feeds back
 * `suggestions`; picking one emits its index (suggestionSelect). Used for
 * venue address search, see api-client's AddressSearchService.
 */
@Component({
  selector: 'ap-autocomplete-field',
  templateUrl: './autocomplete-field.html',
  styleUrl: './autocomplete-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutocompleteField {
  readonly label = input.required<string>();
  readonly hideLabel = input(false);
  readonly placeholder = input<string | null>(null);
  readonly value = input('');
  readonly suggestions = input<readonly AutocompleteSuggestion[]>([]);
  readonly loading = input(false);
  /** Shown under the field when the search failed or found nothing. */
  readonly hint = input<string | null>(null);

  readonly valueChange = output<string>();
  readonly suggestionSelect = output<number>();

  protected readonly inputId = `ap-autocomplete-${nextId++}`;
  protected readonly listId = `${this.inputId}-list`;
  protected readonly focused = signal(false);
  protected readonly activeIndex = signal(-1);
  // Closed right after a pick, until the next keystroke -- otherwise the
  // list (still holding the last results) would reopen over the choice.
  private readonly dismissed = signal(false);

  protected readonly open = computed(
    () => this.focused() && !this.dismissed() && this.suggestions().length > 0,
  );

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected onInput(event: Event): void {
    this.dismissed.set(false);
    this.activeIndex.set(-1);
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    if (!this.open() || count === 0) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.set((this.activeIndex() + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.set((this.activeIndex() - 1 + count) % count);
        break;
      case 'Enter':
        if (this.activeIndex() >= 0) {
          event.preventDefault();
          this.pick(this.activeIndex());
        }
        break;
      case 'Escape':
        this.dismissed.set(true);
        break;
    }
  }

  protected pick(index: number): void {
    this.dismissed.set(true);
    this.activeIndex.set(-1);
    this.suggestionSelect.emit(index);
  }
}
