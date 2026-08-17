import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `<ap-button
    [variant]="variant"
    [size]="size"
    [disabled]="disabled"
    [fullWidth]="fullWidth"
    >Valider</ap-button
  >`,
})
class HostComponent {
  variant: 'primary' | 'secondary' | 'ghost' = 'primary';
  size: 'md' | 'sm' = 'md';
  disabled = false;
  fullWidth = false;
}

@Component({
  imports: [Button],
  template: `<ap-button [href]="href" [target]="target">Voir</ap-button>`,
})
class LinkHostComponent {
  href = 'https://example.com';
  target: string | undefined;
}

@Component({
  imports: [Button],
  template: `<ap-button routerLink="/admin/tournaments">Tournois</ap-button>`,
})
class RouterLinkHostComponent {}

describe('Button', () => {
  it('renders its projected content', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.textContent).toContain('Valider');
  });

  it('reflects the variant as a host attribute for styling', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.variant = 'secondary';
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-button');
    expect(host.getAttribute('data-variant')).toBe('secondary');
  });

  it('reflects the size as a host attribute for styling', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.size = 'sm';
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-button');
    expect(host.getAttribute('data-size')).toBe('sm');
  });

  it('reflects fullWidth as a host attribute for styling', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.fullWidth = true;
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-button');
    expect(host.getAttribute('data-full-width')).toBe('true');
  });

  it('does not set data-full-width when fullWidth is false', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-button');
    expect(host.hasAttribute('data-full-width')).toBe(false);
  });

  it('disables the native button when disabled is true', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
  });

  it('renders an anchor instead of a button when href is set', () => {
    const fixture = TestBed.createComponent(LinkHostComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.textContent).toContain('Voir');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('sets the target attribute on the rendered anchor', () => {
    const fixture = TestBed.createComponent(LinkHostComponent);
    fixture.componentInstance.target = '_blank';
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('renders an anchor with routerLink instead of a button when routerLink is set', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RouterLinkHostComponent);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a');
    expect(link.getAttribute('href')).toBe('/admin/tournaments');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
