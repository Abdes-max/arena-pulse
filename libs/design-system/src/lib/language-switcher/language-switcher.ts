import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

export interface LanguageOption {
  code: string;
  label: string;
}

/**
 * Globe + current language code + chevron, opening a small panel listing
 * every language with a checkmark on the active one -- same visual pattern
 * as the Tournify reference screenshot the porteur de projet shared.
 * Purely presentational, like ap-theme-mode-toggle: takes the current
 * language and the list of choices, emits the code to switch to. The
 * consuming page owns the actual LanguageService.setLanguage() call, so this
 * component has no dependency on design-tokens/Transloco.
 */
@Component({
  selector: 'ap-language-switcher',
  imports: [],
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcher {
  readonly language = input.required<string>();
  readonly languages = input.required<readonly LanguageOption[]>();
  readonly languageChange = output<string>();

  protected readonly open = signal(false);
  protected readonly currentLabel = computed(
    () =>
      this.languages().find((option) => option.code === this.language())?.label ?? this.language(),
  );

  private readonly host = inject(ElementRef<HTMLElement>);

  protected toggle(): void {
    this.open.update((isOpen) => !isOpen);
  }

  protected select(code: string): void {
    this.open.set(false);
    if (code !== this.language()) {
      this.languageChange.emit(code);
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  // Closes on outside click -- there's no overlay/backdrop behind this small
  // panel (unlike a full modal), so this is the only way a tap elsewhere on
  // the page dismisses it. Reads composedPath() rather than `target` so a
  // click that lands inside a shadow DOM (none of our own components use
  // one, but this keeps the check robust) still resolves to the right
  // element.
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) {
      return;
    }
    const path = event.composedPath();
    if (!path.includes(this.host.nativeElement)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}
