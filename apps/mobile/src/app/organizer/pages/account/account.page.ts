import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, TypeToConfirm } from 'design-system';
import { OrganizerAuthService } from '../../core/auth.service';

/**
 * Mirrors apps/web/src/app/admin/pages/account/account.page.ts almost
 * verbatim (same DELETE /auth/me endpoint, same "type SUPPRIMER" gate, same
 * 409 "sole admin" raw-message handling) -- added 2026-08-28 so the native
 * organizer app has a genuine in-app account-deletion path (App Review
 * guideline 5.1.1(v): an app that supports account creation must also offer
 * account deletion, not just a link to a support form). Reached from the
 * tournaments list header (tournaments.page.html's new account button).
 */
@Component({
  selector: 'app-organizer-account-page',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, Button, TypeToConfirm, TranslocoPipe],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerAccountPage {
  private readonly authService = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly user = this.authService.currentUser;

  // Collapsed by default, same in-page-reveal pattern as the web version
  // (no modal) -- the "type SUPPRIMER to confirm" gate is the shared
  // ap-type-to-confirm design-system component.
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

  protected async goBack(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }

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
      await this.router.navigateByUrl('/organizer/login');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        const body = error.error as { message?: string } | null;
        this.errorIsRaw.set(true);
        this.errorMessage.set(
          body?.message ?? this.transloco.translate('organizer.account.errorGeneric'),
        );
      } else if (error instanceof HttpErrorResponse) {
        // TEMPORARY diagnostic (2026-09): the generic translated message was
        // hiding the real cause of a device-only failure (works in every
        // desktop test, fails on real iOS via TestFlight) -- surfacing the
        // raw status/body here so the next on-device retest tells us exactly
        // what's failing (0 = request never reached the server e.g. CORS/
        // network, 4xx/5xx = a real server response) instead of guessing
        // again. Revert to the generic translated message once resolved.
        const body = error.error as { message?: string } | null;
        this.errorIsRaw.set(true);
        this.errorMessage.set(
          `Erreur ${error.status || '(réseau)'} : ${body?.message ?? error.message ?? 'inconnue'}`,
        );
      } else {
        this.errorIsRaw.set(true);
        this.errorMessage.set(
          `Erreur inattendue : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      this.deleting.set(false);
    }
  }
}
