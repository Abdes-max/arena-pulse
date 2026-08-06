import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Select, SelectOption } from './select';

@Component({
  imports: [Select],
  template: `
    <ap-select
      label="Catégorie"
      [hideLabel]="hideLabel"
      [size]="size"
      [value]="value"
      [options]="options"
      (valueChange)="onValueChange($event)"
    />
  `,
})
class HostComponent {
  hideLabel = false;
  size: 'md' | 'sm' = 'md';
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

@Component({
  imports: [Select],
  template: `
    <ap-select
      label="Ajouter"
      [options]="options"
      [resetAfterSelect]="true"
      (valueChange)="onValueChange($event)"
    />
  `,
})
class ResetHostComponent {
  options: SelectOption[] = [
    { value: '', label: '+ Ajouter…' },
    { value: 'x', label: 'Option X' },
    { value: 'y', label: 'Option Y' },
  ];
  received: string | undefined;

  onValueChange(value: string): void {
    this.received = value;
  }
}

@Component({
  imports: [Select, ReactiveFormsModule],
  template: `<ap-select label="Catégorie" [options]="options" [formControl]="control" />`,
})
class FormHostComponent {
  options: SelectOption[] = [
    { value: 'a', label: 'Poule A' },
    { value: 'b', label: 'Poule B' },
  ];
  control = new FormControl('a');
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

  it('shows a non-default initial value correctly on a brand-new instance (e.g. a shell recreated after login with a theme already chosen)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    // Not the first option -- exercises the case where a naive [value]
    // binding on the <select> itself can be applied before its <option>
    // children exist in the DOM, which the browser silently ignores.
    fixture.componentInstance.value = 'b';
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('b');
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

  it('reflects the size as a host attribute for styling', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.size = 'sm';
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('ap-select');
    expect(host.getAttribute('data-size')).toBe('sm');
  });

  it('keeps following the value input in controlled mode after a change event, instead of latching onto the emitted value forever', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.options = [
      { value: 'a', label: 'Poule A' },
      { value: 'b', label: 'Poule B' },
      { value: 'c', label: 'Poule C' },
    ];
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    fixture.componentInstance.value = 'c';
    fixture.detectChanges();

    expect(select.value).toBe('c');
  });

  it('resets to the first option right after emitting when resetAfterSelect is set', () => {
    const fixture = TestBed.createComponent(ResetHostComponent);
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'x';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.received).toBe('x');
    expect(select.value).toBe('');
  });

  it('binds to a FormControl via ControlValueAccessor', () => {
    const fixture = TestBed.createComponent(FormHostComponent);
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.value).toBe('a');

    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('b');
  });
});
