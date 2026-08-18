import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageSwitcher, Logo } from 'design-system';
import { LanguageCode, LanguageService, SUPPORTED_LANGUAGES } from 'design-tokens';

// The body's own paragraphs (legal.terms.section*) only exist as translation
// keys in fr.json/en.json for this lot -- see the plan's explicit scope
// note on legal pages. Transloco's fallbackLang ('fr', set in
// provideTransloco) already makes those keys resolve to the French text in
// any other language, so the page doesn't break -- this flag only drives
// the "translation coming soon" banner, kept separate from the fallback
// mechanism itself so the banner's own wording stays translated in all 6.
const BODY_TRANSLATED_LANGUAGES: readonly LanguageCode[] = ['fr', 'en'];

@Component({
  selector: 'app-terms-page',
  imports: [RouterLink, LanguageSwitcher, Logo, TranslocoPipe],
  templateUrl: './terms.page.html',
  styleUrl: './legal-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TermsPage {
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
