import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo, TextField } from 'design-system';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';
import { AuthService } from '../../core/auth.service';

/**
 * One account for organizers and team managers: an account created without
 * an organization (a team manager's) creates it here to start organizing.
 * The admin's organizationGuard sends such accounts here.
 */
@Component({
  selector: 'app-create-organization-page',
  imports: [ReactiveFormsModule, RouterLink, Button, Logo, TextField, TranslocoPipe],
  templateUrl: './create-organization.page.html',
  styleUrl: './create-organization.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateOrganizationPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
  });
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);

  constructor() {
    // Already organizing: nothing to create.
    if (this.authService.organizations().length > 0) {
      void this.router.navigateByUrl('/admin/tournaments');
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      await this.authService.createOrganization(this.form.getRawValue().name.trim());
      await this.router.navigateByUrl('/admin/tournaments');
    } catch {
      this.errorMessage.set('admin.createOrganization.error');
    } finally {
      this.submitting.set(false);
    }
  }
}
