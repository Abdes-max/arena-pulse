import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
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
}
