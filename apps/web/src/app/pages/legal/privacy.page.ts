import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcher, Logo } from 'design-system';
import { LanguageCode, LanguageService, SUPPORTED_LANGUAGES } from 'design-tokens';

// See terms.page.ts's identical constant for why this list -- and not
// Transloco's own fallbackLang mechanism -- decides the banner.
const BODY_TRANSLATED_LANGUAGES: readonly LanguageCode[] = ['fr', 'en'];

@Component({
  selector: 'app-privacy-page',
  imports: [RouterLink, LanguageSwitcher, Logo, TranslocoPipe],
  templateUrl: './privacy.page.html',
  styleUrl: './legal-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPage {
  private readonly location = inject(Location);
  private readonly languageService = inject(LanguageService);

  protected readonly language = this.languageService.language;
  protected readonly languages = SUPPORTED_LANGUAGES;
  protected readonly bodyAvailable = computed(() =>
    BODY_TRANSLATED_LANGUAGES.includes(this.language() as LanguageCode),
  );

  protected goBack(): void {
    this.location.back();
  }

  protected onLanguageChange(code: string): void {
    this.languageService.setLanguage(code as LanguageCode);
  }
}
