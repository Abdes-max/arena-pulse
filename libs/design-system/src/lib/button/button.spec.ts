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
});
