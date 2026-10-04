import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { OrganizerAuthService } from '../../core/auth.service';

type PageState = 'form' | 'sent';

// Same 'form'/'sent' two-state shape as
// apps/web/src/app/admin/pages/register/register.page.ts, against the same
// /auth/register + /auth/resend-verification endpoints -- see that file's
// comments for the reasoning this mirrors. The verification email itself
// always links to the *web* app (ADMIN_WEB_URL, apps/api/src/auth/auth.service.ts) --
// there's no deep-linking set up in apps/mobile to catch that link back into
// this app, so the 'sent' state's copy explicitly says "open it, then come
// back and log in" rather than implying the app itself will pick it up.
//
// Layout follows the approved mockup (adaptive-leaping-elephant.md, Étape
// 0): app-bar header (brand mark + title -- explicitly requested on top of
// the mockup's own bare title, which doesn't show one), scrollable fields,
// primary CTA pinned in a footer. See login.page.scss's comment on
// `display: contents` for why the <form> wraps both ion-content and
// ion-footer.
@Component({
  selector: 'app-organizer-register-page',
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
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerRegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);

  protected readonly form = this.formBuilder.nonNullable.group({
    organizationName: ['', Validators.required],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10)]],
  });

  protected readonly state = signal<PageState>('form');
  protected readonly registeredEmail = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly resent = signal(false);
  // Flagged on a submit attempt made while the form is still invalid (e.g.
  // tapping "Créer mon compte" without having blurred the last field yet --
  // touched alone wouldn't catch that). Reported by Apple App Review
  // 2026-10-04 (Guideline 2.1(a)) as "the Create my account button was
  // unresponsive": no field here ever showed *why* -- TextField's own
  // errorMessage input (libs/design-system) was never wired up by this
  // page, so an invalid form (the password minlength(10) requirement is
  // never hinted at anywhere) just silently no-opped on tap. fieldError()
  // below now surfaces that instead of submit() returning in silence.
  protected readonly submitAttempted = signal(false);

  protected fieldError(
    name: 'organizationName' | 'firstName' | 'lastName' | 'email' | 'password',
  ): string | null {
    const control = this.form.controls[name];
    if (!(control.touched || this.submitAttempted()) || control.valid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'organizer.auth.register.errors.required';
    }
    if (control.hasError('email')) {
      return 'organizer.auth.register.errors.email';
    }
    if (control.hasError('minlength')) {
      return 'organizer.auth.register.errors.passwordMinLength';
    }
    return null;
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      // Reveals every field's error at once rather than one-at-a-time as
      // the organizer blurs each field -- see submitAttempted's own comment.
      this.submitAttempted.set(true);
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.auth.register(this.form.getRawValue());
      this.registeredEmail.set(response.email);
      this.state.set('sent');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errorMessage.set('organizer.auth.register.errorConflict');
      } else {
        this.errorMessage.set('organizer.auth.register.errorGeneric');
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
      await this.auth.resendVerification(email);
      this.resent.set(true);
    } catch {
      this.errorMessage.set('organizer.auth.register.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }

  /** Top-right close (X) -- bails out to the app's public home ('/'), same target as login.page.ts's own cancel(). */
  protected cancel(): void {
    void this.router.navigateByUrl('/');
  }
}
