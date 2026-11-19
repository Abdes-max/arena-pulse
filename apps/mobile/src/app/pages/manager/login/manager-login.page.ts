import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';
import { PlayerAuthService } from '../../../core/player-auth.service';
import { isSafeReturnUrl } from '../../../core/safe-return-url.util';

/** Team manager sign-in (to pre-register a team, open the manager space) -- same look as the organizer's login. */
@Component({
  selector: 'app-manager-login-page',
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
  templateUrl: './manager-login.page.html',
  styleUrl: '../manager-auth.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerLoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(PlayerAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
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
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email, password);
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(
        isSafeReturnUrl(requested) ? requested : '/espace-responsable',
      );
    } catch {
      this.errorMessage.set('manager.login.error');
    } finally {
      this.submitting.set(false);
    }
  }

  protected goBack(): void {
    this.location.back();
  }
}
