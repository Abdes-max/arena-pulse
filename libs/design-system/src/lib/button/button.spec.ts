import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `<ap-button [variant]="variant" [disabled]="disabled">Valider</ap-button>`,
})
class HostComponent {
  variant: 'primary' | 'secondary' | 'ghost' = 'primary';
  disabled = false;
}

@Component({
  imports: [Button],
  template: `<ap-button [href]="href" [target]="target">Voir</ap-button>`,
})
class LinkHostComponent {
  href = 'https://example.com';
  target: string | undefined;
}

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
});
