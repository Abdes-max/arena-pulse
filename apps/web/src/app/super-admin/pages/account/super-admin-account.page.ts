import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Button, TextField } from 'design-system';
import { SuperAdminAuthService } from '../../core/super-admin-auth.service';

@Component({
  selector: 'app-super-admin-account-page',
  imports: [ReactiveFormsModule, Button, TextField],
  templateUrl: './super-admin-account.page.html',
  styleUrl: './super-admin-account.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminAccountPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly superAdminAuthService = inject(SuperAdminAuthService);
  private readonly router = inject(Router);

  protected readonly superAdmin = this.superAdminAuthService.currentSuperAdmin;

  protected readonly dangerZoneOpen = signal(false);
  protected readonly deleteForm = this.formBuilder.nonNullable.group({
    password: ['', Validators.required],
  });
  protected readonly deleting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected openDangerZone(): void {
    this.dangerZoneOpen.set(true);
  }

  protected cancelDeletion(): void {
    this.dangerZoneOpen.set(false);
    this.deleteForm.reset({ password: '' });
    this.errorMessage.set(null);
  }

  protected async deleteAccount(): Promise<void> {
    if (this.deleteForm.invalid || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      const { password } = this.deleteForm.getRawValue();
      await this.superAdminAuthService.deleteAccount(password);
      await this.router.navigate(['/super-admin/login']);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.errorMessage.set('Mot de passe incorrect.');
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        const body = error.error as { message?: string } | null;
        this.errorMessage.set(
          body?.message ?? 'Impossible de supprimer le dernier compte super-administrateur.',
        );
      } else {
        this.errorMessage.set('Une erreur est survenue, réessayez.');
      }
    } finally {
      this.deleting.set(false);
    }
  }
}
