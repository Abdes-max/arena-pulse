import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LanguageOption, LanguageSwitcher } from './language-switcher';

const LANGUAGES: LanguageOption[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

@Component({
  imports: [LanguageSwitcher],
  template: `
    <ap-language-switcher
      [language]="language"
      [languages]="languages"
      (languageChange)="onLanguageChange($event)"
    />
  `,
})
class HostComponent {
  language = 'fr';
  languages = LANGUAGES;
  received: string | undefined;

  onLanguageChange(code: string): void {
    this.received = code;
  }
}

describe('LanguageSwitcher', () => {
  it('shows the current language code, closed by default', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.ap-language-switcher__trigger',
    );
    expect(trigger.textContent).toContain('FR');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.ap-language-switcher__panel')).toBeNull();
  });

  it('opens the panel and lists every language, with a checkmark on the active one', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const trigger: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.ap-language-switcher__trigger',
    );
    trigger.click();
    fixture.detectChanges();

    const options: NodeListOf<HTMLLIElement> = fixture.nativeElement.querySelectorAll(
      '.ap-language-switcher__option',
    );
    expect(options.length).toBe(3);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[0].querySelector('svg')).not.toBeNull();
    expect(options[1].getAttribute('aria-selected')).toBe('false');
    expect(options[1].querySelector('svg')).toBeNull();
  });

  it('emits the picked language and closes the panel', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.ap-language-switcher__trigger').click();
    fixture.detectChanges();
    const options: NodeListOf<HTMLLIElement> = fixture.nativeElement.querySelectorAll(
      '.ap-language-switcher__option',
    );
    options[2].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toBe('es');
    expect(fixture.nativeElement.querySelector('.ap-language-switcher__panel')).toBeNull();
  });

  it('does not emit when re-selecting the already-active language', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.ap-language-switcher__trigger').click();
    fixture.detectChanges();
    const options: NodeListOf<HTMLLIElement> = fixture.nativeElement.querySelectorAll(
      '.ap-language-switcher__option',
    );
    options[0].click(); // fr, already active
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toBeUndefined();
  });

  it('closes when a click lands outside the component', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.ap-language-switcher__trigger').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ap-language-switcher__panel')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ap-language-switcher__panel')).toBeNull();
  });

  it('opens right-aligned by default (trigger has room to its right)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const switcherHost: HTMLElement = fixture.nativeElement.querySelector('ap-language-switcher');
    vi.spyOn(switcherHost, 'getBoundingClientRect').mockReturnValue({
      right: 800,
    } as DOMRect);
    switcherHost.querySelector<HTMLButtonElement>('.ap-language-switcher__trigger')!.click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.ap-language-switcher__panel');
    expect(panel.classList.contains('ap-language-switcher__panel--left')).toBe(false);
  });

  it('flips to open left-aligned when the trigger sits too close to the left edge for right-anchoring to fit', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const switcherHost: HTMLElement = fixture.nativeElement.querySelector('ap-language-switcher');
    vi.spyOn(switcherHost, 'getBoundingClientRect').mockReturnValue({
      right: 80,
    } as DOMRect);
    switcherHost.querySelector<HTMLButtonElement>('.ap-language-switcher__trigger')!.click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('.ap-language-switcher__panel');
    expect(panel.classList.contains('ap-language-switcher__panel--left')).toBe(true);
  });

  it('closes on Escape', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.ap-language-switcher__trigger').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ap-language-switcher__panel')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.ap-language-switcher__panel')).toBeNull();
  });
});
