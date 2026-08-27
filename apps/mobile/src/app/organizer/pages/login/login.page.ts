import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { isSafeReturnUrl } from '../../../core/safe-return-url.util';
import { OrganizerAuthService } from '../../core/auth.service';

// Same shape as apps/web/src/app/admin/pages/login/login.page.ts (see its
// comments) -- default landing route differs (this app has no
// /admin/tournaments), see submit() below. Layout follows the approved
// mockup (adaptive-leaping-elephant.md, Étape 0) rather than the previous
// centered-logo card: app-bar header (back link into /organizer/register,
// matching the mockup's screen-to-screen back arrow, plus a small brand
// mark + title -- explicitly requested on top of the mockup's own bare
// title, which doesn't show one), scrollable fields, and the primary CTA
// pinned in a footer -- see login.page.scss for how the
// [formGroup] wraps both ion-content and ion-footer (display: contents) so
// the submit button in the footer still participates in the same <form>.
@Component({
  selector: 'app-organizer-login-page',
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
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerLoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

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
      await this.auth.login(email, password);
      const requestedReturnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const returnUrl = isSafeReturnUrl(requestedReturnUrl)
        ? requestedReturnUrl
        : '/organizer/tournaments';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 403) {
        this.errorMessage.set('organizer.auth.login.errorVerify');
        this.needsVerification.set(true);
      } else {
        this.errorMessage.set('organizer.auth.login.errorCredentials');
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
      await this.auth.resendVerification(email);
      this.resent.set(true);
    } catch {
      this.errorMessage.set('organizer.auth.login.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }

  // Mirrors the mockup's appbar back arrow (goScreen('register')). Uses
  // browser/router history rather than hardcoding routerLink="/organizer/register"
  // -- this page can also be reached directly (e.g. tournament-entry page's
  // Paramètres panel), where "back" should return there, not force a detour
  // through the register screen.
  protected goBack(): void {
    this.location.back();
  }
}
