import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcher, ThemeModeToggle } from 'design-system';
import {
  LanguageCode,
  LanguageService,
  SUPPORTED_LANGUAGES,
  ThemeMode,
  ThemeService,
} from 'design-tokens';
import { AuthService } from '../core/auth.service';
import { AdminUiMode } from '../core/models';

/**
 * The gear button of the admin header (and the manager space's): Simple /
 * Complet, light/dark, language and sign-out in one small panel instead of
 * four controls crowding the header row.
 */
@Component({
  selector: 'app-settings-menu',
  imports: [LanguageSwitcher, ThemeModeToggle, TranslocoPipe],
  template: `
    <button
      type="button"
      class="settings-menu__toggle"
      [class.settings-menu__toggle--open]="open()"
      (click)="toggle()"
      [attr.aria-expanded]="open()"
      aria-controls="settings-menu-panel"
      [attr.aria-label]="'admin.shell.settings' | transloco"
      [title]="'admin.shell.settings' | transloco"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
        />
      </svg>
    </button>
    @if (open()) {
      <div
        class="settings-menu__panel"
        id="settings-menu-panel"
        role="group"
        [attr.aria-label]="'admin.shell.settings' | transloco"
      >
        @if (showUiMode()) {
          <div class="settings-menu__row">
            <span>{{ 'admin.shell.uiMode.label' | transloco }}</span>
            <div class="settings-menu__ui-mode" role="group">
              <button
                type="button"
                class="settings-menu__ui-mode-option"
                [class.settings-menu__ui-mode-option--active]="authService.simpleMode()"
                [attr.aria-pressed]="authService.simpleMode()"
                (click)="setUiMode('SIMPLE')"
              >
                {{ 'admin.shell.uiMode.simple' | transloco }}
              </button>
              <button
                type="button"
                class="settings-menu__ui-mode-option"
                [class.settings-menu__ui-mode-option--active]="!authService.simpleMode()"
                [attr.aria-pressed]="!authService.simpleMode()"
                (click)="setUiMode('FULL')"
              >
                {{ 'admin.shell.uiMode.full' | transloco }}
              </button>
            </div>
          </div>
        }
        <div class="settings-menu__row">
          <span>{{ 'admin.shell.theme' | transloco }}</span>
          <ap-theme-mode-toggle [mode]="mode()" (modeChange)="onModeChange($event)" />
        </div>
        <div class="settings-menu__row">
          <span>{{ 'admin.shell.language' | transloco }}</span>
          <ap-language-switcher
            [language]="language()"
            [languages]="languages"
            (languageChange)="onLanguageChange($event)"
          />
        </div>
        <button type="button" class="settings-menu__logout" (click)="signOut()">
          {{ 'admin.shell.logout' | transloco }}
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }

    .settings-menu__toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: var(--ap-border-width) solid var(--ap-color-border);
      border-radius: var(--ap-radius-md);
      background: transparent;
      color: var(--ap-color-fg);
      cursor: pointer;

      svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
        transition: transform var(--ap-motion-fast) var(--ap-easing-standard);
      }

      &:focus-visible {
        outline: 2px solid var(--ap-color-focus);
        outline-offset: 2px;
      }
    }

    .settings-menu__toggle--open svg {
      transform: rotate(45deg);
    }

    .settings-menu__panel {
      position: absolute;
      top: calc(100% + var(--ap-space-2));
      right: 0;
      z-index: calc(var(--ap-z-sticky) + 1);
      display: flex;
      flex-direction: column;
      gap: var(--ap-space-3);
      min-width: 290px;
      padding: var(--ap-space-4);
      background: var(--ap-color-surface);
      border: var(--ap-border-width) solid var(--ap-color-border);
      border-radius: var(--ap-radius-lg);
      box-shadow: var(--ap-shadow-lg, 0 10px 30px rgb(0 0 0 / 25%));
      color: var(--ap-color-fg);
    }

    .settings-menu__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ap-space-3);
      font-weight: 600;
      font-size: 0.9rem;
      white-space: nowrap;
    }

    .settings-menu__ui-mode {
      display: inline-flex;
      padding: 2px;
      border: var(--ap-border-width) solid var(--ap-color-border);
      border-radius: var(--ap-radius-pill);
    }

    .settings-menu__ui-mode-option {
      padding: var(--ap-space-1) var(--ap-space-3);
      border: none;
      border-radius: var(--ap-radius-pill);
      background: transparent;
      color: var(--ap-color-muted);
      font: inherit;
      font-size: 0.8rem;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--ap-color-focus);
        outline-offset: 2px;
      }
    }

    .settings-menu__ui-mode-option--active {
      background: var(--ap-color-primary);
      color: var(--ap-color-on-primary);
    }

    .settings-menu__logout {
      margin-top: var(--ap-space-1);
      padding: var(--ap-space-2) var(--ap-space-3);
      border: var(--ap-border-width) solid var(--ap-color-border);
      border-radius: var(--ap-radius-md);
      background: transparent;
      color: var(--ap-color-fg);
      font: inherit;
      font-weight: 700;
      cursor: pointer;

      &:hover {
        border-color: var(--ap-color-signal);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
})
export class SettingsMenu {
  /** Simple / Complet: only for an account with an organization. */
  readonly showUiMode = input(true);
  /** Sign-out is the page's own (session clock, redirect). */
  readonly logout = output<void>();
  /** Opened: the page closes its own phone menu. */
  readonly opened = output<void>();

  protected readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly mode = this.themeService.mode;
  protected readonly language = this.languageService.language;
  protected readonly languages = SUPPORTED_LANGUAGES;

  /** Closes the panel -- e.g. when the page opens its phone menu. */
  close(): void {
    this.open.set(false);
  }

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open()) {
      this.opened.emit();
    }
  }

  // A click anywhere outside closes it (inside: the language list, the
  // toggles... keep it open).
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  protected setUiMode(mode: AdminUiMode): void {
    void this.authService.setAdminUiMode(mode);
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next, true);
  }

  protected onLanguageChange(code: string): void {
    this.languageService.setLanguage(code as LanguageCode);
  }

  protected signOut(): void {
    this.open.set(false);
    this.logout.emit();
  }
}
