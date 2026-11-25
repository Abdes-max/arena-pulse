import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { isCompleteFullName, splitFullName } from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';

type PageState = 'form' | 'sent';

// Needs a first and a last name (two words at least).
function completeFullName(control: AbstractControl<string>): ValidationErrors | null {
  return !control.value || isCompleteFullName(control.value) ? null : { fullName: true };
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo, TextField, TranslocoPipe],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly form = this.formBuilder.nonNullable.group({
    // Optional: only to organize tournaments (a team manager leaves it empty).
    organizationName: [''],
    // One « Prénom et nom » field, split for the API on submit (splitFullName).
    fullName: ['', [Validators.required, completeFullName]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10)]],
  });

  protected readonly state = signal<PageState>('form');
  protected readonly registeredEmail = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);
  protected readonly resent = signal(false);

  protected readonly fullNameTouched = signal(false);
  // Shown once the field was left (or a submit tried) with a single word.
  protected fullNameError(): string | null {
    const control = this.form.controls.fullName;
    return this.fullNameTouched() && control.invalid ? 'admin.auth.register.fullNameError' : null;
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.fullNameTouched.set(true);
    }
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const { fullName, ...rest } = this.form.getRawValue();
      const response = await this.authService.register({ ...rest, ...splitFullName(fullName) });
      this.registeredEmail.set(response.email);
      this.state.set('sent');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errorMessage.set('admin.auth.register.errorConflict');
      } else {
        this.errorMessage.set('admin.auth.register.errorGeneric');
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected async resendVerification(): Promise<void> {
    const email = this.registeredEmail();
    if (!email || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.authService.resendVerification(email);
      this.resent.set(true);
    } catch {
      this.errorMessage.set('admin.auth.register.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }
}
