import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Logo, LogoVariant } from './logo';

@Component({
  imports: [Logo],
  template: `<ap-logo [variant]="variant" [wordmark]="wordmark" />`,
})
class HostComponent {
  variant: LogoVariant = 'on-light';
  wordmark = true;
}

describe('Logo', () => {
  it('renders the TournArena wordmark as real text by default', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('TournArena');
  });

  it('falls back to a visually-hidden name when the wordmark is hidden', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.wordmark = false;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('TournArena');
    expect(fixture.nativeElement.querySelector('.ap-logo__wordmark')).toBeNull();
  });

  it('reflects the variant as a host attribute so it can be styled for a dark surface', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'on-dark';
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-logo');
    expect(host.getAttribute('data-variant')).toBe('on-dark');
  });

  it('hides the icon from assistive tech (the text already carries the name)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
