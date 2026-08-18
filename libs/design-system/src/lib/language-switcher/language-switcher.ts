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

  // Whether to flip the panel to open left-aligned instead of the default
  // right-aligned -- right:0 keeps the panel on-screen when the trigger
  // sits near a container's right edge (tournament-shell's actions row, the
  // mobile app's settings row), but overflows off the *left* edge of the
  // viewport when the trigger sits near the left instead (confirmed live:
  // the landing page's mobile slide-down nav menu, where every other
  // control -- Fonctionnalités, Sports... -- is also left-aligned).
  // Computed once per open from the trigger's own position (not the
  // panel's, which isn't in the DOM yet) -- close enough to decide a
  // direction without waiting a frame for the panel to render and measuring
  // that instead.
  protected readonly openLeft = signal(false);

  // Matches --ap-language-switcher__panel's min-width (9rem at the default
  // 16px root) plus a little breathing room -- an estimate, not a measured
  // value, but only used to pick a side, not to size anything.
  private static readonly ESTIMATED_PANEL_WIDTH_PX = 150;

  private readonly host = inject(ElementRef<HTMLElement>);

  protected toggle(): void {
    const willOpen = !this.open();
    if (willOpen) {
      const rect = this.host.nativeElement.getBoundingClientRect();
      this.openLeft.set(rect.right - LanguageSwitcher.ESTIMATED_PANEL_WIDTH_PX < 0);
    }
    this.open.set(willOpen);
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
