import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { OrganizerAuthService } from '../../core/auth.service';

type PageState = 'form' | 'sent';

// Same 'form'/'sent' two-state shape as register.page.ts, against an
// endpoint with the same no-leak posture (OrganizerAuthService.
// requestPasswordReset) -- the 'sent' state shows regardless of whether the
// email was actually registered. The reset form itself only ever opens on
// the *web* app (see OrganizerAuthService's own comment on why), so, same
// as register's sentHint, this tells the organizer to open it there and
// come back here to log in rather than implying this app will pick it up.
@Component({
  selector: 'app-organizer-forgot-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Button,
    IonContent,
    IonFooter,
    IonHeader,
    IonTitle,
    IonToolbar,
    Logo,
    TextField,
    TranslocoPipe,
  ],
  templateUrl: './forgot-password.page.html',
  styleUrl: './forgot-password.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerForgotPasswordPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

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
      await this.auth.requestPasswordReset(email);
      this.submittedEmail.set(email);
      this.state.set('sent');
    } catch {
      this.errorMessage.set('organizer.auth.forgotPassword.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }

  protected goBack(): void {
    this.location.back();
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/');
  }
}
