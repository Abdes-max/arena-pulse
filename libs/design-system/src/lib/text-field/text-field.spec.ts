import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TextField } from './text-field';

@Component({
  imports: [TextField, ReactiveFormsModule],
  template: `<ap-text-field [label]="label" [errorMessage]="errorMessage" [formControl]="control" />`,
})
class HostComponent {
  label = 'Email';
  errorMessage: string | null = null;
  control = new FormControl('');
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
});
