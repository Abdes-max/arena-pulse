import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo, TextField, TranslocoPipe],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly needsVerification = signal(false);
  protected readonly resent = signal(false);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.needsVerification.set(false);
    this.resent.set(false);
    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.login(email, password);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/admin/tournaments';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 403) {
        this.errorMessage.set('admin.auth.login.errorVerify');
        this.needsVerification.set(true);
      } else {
        this.errorMessage.set('admin.auth.login.errorCredentials');
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected async resendVerification(): Promise<void> {
    const email = this.form.controls.email.value;
    if (!email || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.authService.resendVerification(email);
      this.resent.set(true);
    } catch {
      this.errorMessage.set('admin.auth.login.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }
}
