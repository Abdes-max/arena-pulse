import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeMode, ThemeModeToggle } from './theme-mode-toggle';

@Component({
  imports: [ThemeModeToggle],
  template: `<ap-theme-mode-toggle [mode]="mode" (modeChange)="onModeChange($event)" />`,
})
class HostComponent {
  mode: ThemeMode = 'light';
  received: ThemeMode | undefined;

  onModeChange(mode: ThemeMode): void {
    this.received = mode;
  }
}

describe('ThemeModeToggle', () => {
  it('reflects the current mode via aria-checked and aria-label', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-checked')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Passer en mode sombre');
  });

  it('reflects dark mode', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.mode = 'dark';
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-checked')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Passer en mode clair');
  });

  it('emits the opposite mode when clicked', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toBe('dark');
  });
});
