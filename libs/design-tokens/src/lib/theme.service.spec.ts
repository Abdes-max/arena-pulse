import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
    element = document.createElement('div');
  });

  it('defaults to ink-signal / light', () => {
    expect(service.theme()).toBe('ink-signal');
    expect(service.mode()).toBe('light');
  });

  it('applies theme and mode as data attributes on the given element', () => {
    service.apply(element, 'pulse-ember', 'dark');

    expect(element.getAttribute('data-theme')).toBe('pulse-ember');
    expect(element.getAttribute('data-mode')).toBe('dark');
    expect(service.theme()).toBe('pulse-ember');
    expect(service.mode()).toBe('dark');
  });

  it('setTheme only changes the theme attribute, leaving mode untouched', () => {
    service.apply(element, 'ink-signal', 'dark');
    service.setTheme(element, 'neon-court');

    expect(element.getAttribute('data-theme')).toBe('neon-court');
    expect(element.getAttribute('data-mode')).toBe('dark');
  });
});
