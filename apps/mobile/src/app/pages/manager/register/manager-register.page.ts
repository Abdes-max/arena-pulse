import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';
import { PlayerAuthService } from '../../../core/player-auth.service';
import { isSafeReturnUrl } from '../../../core/safe-return-url.util';

/** Team manager sign-up -- distinct from an organizer account (PlayerAccount). */
@Component({
  selector: 'app-manager-register-page',
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
  templateUrl: './manager-register.page.html',
  styleUrl: '../manager-auth.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerRegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(PlayerAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  // Same rules as the API's PlayerRegisterDto (password: 10 characters).
  protected readonly form = this.formBuilder.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10)]],
  });
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.auth.register(this.form.getRawValue());
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(
        isSafeReturnUrl(requested) ? requested : '/espace-responsable',
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'manager.register.errorTaken'
          : 'manager.register.error',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected goBack(): void {
    this.location.back();
  }
}
