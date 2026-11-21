import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';
import { OrganizerAuthService } from '../../core/auth.service';

/**
 * One account for organizers and team managers: an account created without
 * an organization (a team manager's) creates it here to start organizing
 * (organizerOrgGuard sends such accounts here).
 */
@Component({
  selector: 'app-create-organization-page',
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
  templateUrl: './create-organization.page.html',
  styleUrl: './create-organization.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateOrganizationPage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
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
      await this.auth.createOrganization(this.form.getRawValue().name.trim());
      await this.router.navigateByUrl('/organizer/tournaments');
    } catch {
      this.errorMessage.set('organizer.createOrganization.error');
    } finally {
      this.submitting.set(false);
    }
  }
}
