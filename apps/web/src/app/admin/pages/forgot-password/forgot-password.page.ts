import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';

type PageState = 'form' | 'sent';

// Same 'form'/'sent' two-state shape as register.page.ts, against an
// endpoint with the same no-leak posture (AuthService.requestPasswordReset,
// apps/api) -- the 'sent' state shows regardless of whether the email was
// actually registered, so this page itself never reveals that either.
@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo, TextField, TranslocoPipe],
  templateUrl: './forgot-password.page.html',
  styleUrl: './forgot-password.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly state = signal<PageState>('form');
  protected readonly submittedEmail = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const { email } = this.form.getRawValue();
      await this.authService.requestPasswordReset(email);
      this.submittedEmail.set(email);
      this.state.set('sent');
    } catch {
      this.errorMessage.set('admin.auth.forgotPassword.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }
}
