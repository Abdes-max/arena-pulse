import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Select, SelectOption } from './select';

@Component({
  imports: [Select],
  template: `
    <ap-select
      label="Catégorie"
      [hideLabel]="hideLabel"
      [value]="value"
      [options]="options"
      (valueChange)="onValueChange($event)"
    />
  `,
})
class HostComponent {
  hideLabel = false;
  value = 'a';
  options: SelectOption[] = [
    { value: 'a', label: 'Poule A' },
    { value: 'b', label: 'Poule B' },
  ];
  received: string | undefined;

  onValueChange(value: string): void {
    this.received = value;
  }
}

describe('Select', () => {
  it('renders one option per entry and reflects the current value', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(2);
    expect(select.value).toBe('a');
  });

  it('emits valueChange when the selection changes', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toBe('b');
  });

  it('visually hides the label but keeps it for screen readers when hideLabel is set', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.hideLabel = true;
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('label');
    expect(label.classList.contains('ap-select__label--hidden')).toBe(true);
    expect(label.textContent.trim()).toBe('Catégorie');
  });
});
