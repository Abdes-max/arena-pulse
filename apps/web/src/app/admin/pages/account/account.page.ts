import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-account-page',
  imports: [ReactiveFormsModule, Button, TextField, TranslocoPipe],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly user = this.authService.currentUser;

  // Collapsed by default -- the first destructive-action confirmation in
  // this app, kept as an in-page reveal rather than a modal dialog (no
  // reusable confirmation component exists yet, and there's only this one
  // usage plus its super-admin twin).
  protected readonly dangerZoneOpen = signal(false);
  protected readonly deleteForm = this.formBuilder.nonNullable.group({
    password: ['', Validators.required],
  });
  protected readonly deleting = signal(false);
  // Either a translation key (generic cases) or raw server text (the 409
  // "last admin" case, which already names the organization in French --
  // see AuthService.deleteAccount server-side).
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly errorIsRaw = signal(false);
  protected readonly displayedError = computed(() =>
    this.errorMessage() === null
      ? null
      : this.errorIsRaw()
        ? this.errorMessage()!
        : this.transloco.translate(this.errorMessage()!),
  );

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
      await this.authService.deleteAccount(password);
      await this.router.navigate(['/admin/login'], {
        queryParams: { accountDeleted: '1' },
      });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.errorIsRaw.set(false);
        this.errorMessage.set('admin.account.errorWrongPassword');
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        const body = error.error as { message?: string } | null;
        this.errorIsRaw.set(true);
        this.errorMessage.set(
          body?.message ?? this.transloco.translate('admin.account.errorGeneric'),
        );
      } else {
        this.errorIsRaw.set(false);
        this.errorMessage.set('admin.account.errorGeneric');
      }
    } finally {
      this.deleting.set(false);
    }
  }
}
