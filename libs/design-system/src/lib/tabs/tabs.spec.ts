import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Tabs, TabOption } from './tabs';

@Component({
  imports: [Tabs],
  template: `
    <ap-tabs
      label="Catégorie"
      [value]="value"
      [options]="options"
      (valueChange)="onValueChange($event)"
    />
  `,
})
class HostComponent {
  value = 'a';
  options: TabOption[] = [
    { value: 'a', label: 'Poule A' },
    { value: 'b', label: 'Poule B' },
  ];
  received: string | undefined;

  onValueChange(value: string): void {
    this.received = value;
  }
}

describe('Tabs', () => {
  it('renders one tab per option and marks the current value as selected', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const tabs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.ap-tabs__tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[0].classList.contains('ap-tabs__tab--active')).toBe(true);
  });

  it('emits valueChange when a different tab is clicked', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const tabs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.ap-tabs__tab');
    tabs[1].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toBe('b');
  });

  it('does not emit when the already-selected tab is clicked again', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const tabs: HTMLButtonElement[] = fixture.nativeElement.querySelectorAll('.ap-tabs__tab');
    tabs[0].click();
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toBeUndefined();
  });
});
