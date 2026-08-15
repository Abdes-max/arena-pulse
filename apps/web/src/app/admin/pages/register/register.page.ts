import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Button, Logo, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';

type PageState = 'form' | 'sent';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo, TextField],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly form = this.formBuilder.nonNullable.group({
    organizationName: ['', Validators.required],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected readonly state = signal<PageState>('form');
  protected readonly registeredEmail = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly resent = signal(false);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.authService.register(this.form.getRawValue());
      this.registeredEmail.set(response.email);
      this.state.set('sent');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errorMessage.set('Un compte existe déjà avec cet email.');
      } else {
        this.errorMessage.set('Une erreur est survenue, réessayez.');
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
      this.errorMessage.set('Une erreur est survenue, réessayez.');
    } finally {
      this.submitting.set(false);
    }
  }
}
