import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';

type PageState = 'form' | 'success' | 'error';

// Reached from the link in the password-reset email (AuthService.
// buildResetPasswordUrl, apps/api) -- unlike VerifyEmailPage, this doesn't
// act on load: the organizer still has to choose a new password, so 'form'
// is the initial state rather than 'loading'.
@Component({
  selector: 'app-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo, TextField, TranslocoPipe],
  templateUrl: './reset-password.page.html',
  styleUrl: './reset-password.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  protected readonly token = this.route.snapshot.paramMap.get('token')!;

  protected readonly form = this.formBuilder.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(10)]],
    confirmPassword: ['', Validators.required],
  });

  protected readonly state = signal<PageState>('form');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Only shown once a submit was actually attempted -- matches this
  // codebase's submitAttempted convention (see mobile's register.page.ts)
  // for surfacing the mismatch instead of a disabled button silently
  // no-opping on tap.
  protected readonly mismatch = signal(false);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    const { newPassword, confirmPassword } = this.form.getRawValue();
    if (newPassword !== confirmPassword) {
      this.mismatch.set(true);
      return;
    }
    this.mismatch.set(false);
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.authService.resetPassword(this.token, newPassword);
      this.state.set('success');
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'admin.auth.resetPassword.errorExpired'
          : 'admin.auth.resetPassword.errorGeneric',
      );
      this.state.set('error');
    } finally {
      this.submitting.set(false);
    }
  }
}
