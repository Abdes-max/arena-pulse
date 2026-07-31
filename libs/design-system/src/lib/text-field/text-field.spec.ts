import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TextField } from './text-field';

@Component({
  imports: [TextField, ReactiveFormsModule],
  template: `<ap-text-field
    [label]="label"
    [errorMessage]="errorMessage"
    [formControl]="control"
  />`,
})
class HostComponent {
  label = 'Email';
  errorMessage: string | null = null;
  control = new FormControl('');
}

@Component({
  imports: [TextField],
  template: `<ap-text-field
      label="Nouvelle catégorie"
      [hideLabel]="true"
      [value]="value()"
      (valueChange)="value.set($event)"
    />
    <button type="button" (click)="add()">Ajouter</button>`,
})
class ControlledHostComponent {
  // A signal, and the reset happens from inside a real event handler
  // (a button click) -- exactly the shape of every "type a name, click
  // Ajouter, field clears" form in the actual app (tournament-form,
  // structure, team-list, referees...), as opposed to a test harness
  // reaching in and mutating a plain field directly, which never goes
  // through Angular's own dirty-tracking the way a real interaction does.
  readonly value = signal('');
  added: string[] = [];

  add(): void {
    this.added.push(this.value());
    this.value.set('');
  }
}

describe('TextField', () => {
  it('renders the label and binds the initial form value', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.control.setValue('ada@example.com');
    fixture.detectChanges();

    const label = fixture.nativeElement.querySelector('label');
    const input = fixture.nativeElement.querySelector('input');
    expect(label.textContent).toContain('Email');
    expect(input.value).toBe('ada@example.com');
  });

  it('propagates input changes back to the form control', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'new@example.com';
    input.dispatchEvent(new Event('input'));

    expect(fixture.componentInstance.control.value).toBe('new@example.com');
  });

  it('reflects an error message with aria attributes', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.errorMessage = 'Email invalide';
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    const error = fixture.nativeElement.querySelector('.ap-text-field__error');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(error.textContent).toContain('Email invalide');
  });

  it('disables the input when the form control is disabled', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.control.disable();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input');
    expect(input.disabled).toBe(true);
  });

  it('shows a non-default initial value correctly on a brand-new instance (e.g. pre-filling a name field when editing an existing record)', () => {
    const fixture = TestBed.createComponent(ControlledHostComponent);
    fixture.componentInstance.value.set('Les Aigles');
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('Les Aigles');
  });

  it('clears after typing a name and clicking "Ajouter", matching the real add-then-reset forms in this app', async () => {
    const fixture = TestBed.createComponent(ControlledHostComponent);
    fixture.autoDetectChanges(true);
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    input.value = 'U10';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('U10');

    button.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.added).toEqual(['U10']);
    expect(input.value).toBe('');
  });

  it('binds to a FormControl via ControlValueAccessor', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('');

    fixture.componentInstance.control.setValue('via-form-control@example.com');
    fixture.detectChanges();

    expect(input.value).toBe('via-form-control@example.com');
  });
});
