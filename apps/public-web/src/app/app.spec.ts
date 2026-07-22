import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the design system showcase', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('design system');
  });

  it('defaults to the ink-signal theme in light mode', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const container = (fixture.nativeElement as HTMLElement).querySelector('.showcase');
    expect(container?.getAttribute('data-theme')).toBe('ink-signal');
    expect(container?.getAttribute('data-mode')).toBe('light');
  });
});
