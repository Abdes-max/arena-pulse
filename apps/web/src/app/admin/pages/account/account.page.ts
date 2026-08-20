import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, TypeToConfirm } from 'design-system';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-account-page',
  imports: [Button, TypeToConfirm, TranslocoPipe],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly user = this.authService.currentUser;

  // Collapsed by default -- the first destructive-action confirmation in
  // this app, kept as an in-page reveal rather than a modal dialog. The
  // "type SUPPRIMER to confirm" gate (feat/173, replacing password
  // re-entry) is the shared ap-type-to-confirm design-system component.
  protected readonly dangerZoneOpen = signal(false);
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
    this.errorMessage.set(null);
  }

  protected async deleteAccount(): Promise<void> {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      // ap-type-to-confirm only emits (confirm) once the user has typed its
      // confirmWord (default "SUPPRIMER") -- safe to send literally here.
      await this.authService.deleteAccount('SUPPRIMER');
      await this.router.navigate(['/admin/login'], {
        queryParams: { accountDeleted: '1' },
      });
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
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
