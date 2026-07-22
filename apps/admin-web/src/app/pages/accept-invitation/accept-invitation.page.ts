import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Button, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { InvitationsService } from '../../core/invitations.service';
import { InvitationLookup } from '../../core/models';

type PageState = 'loading' | 'error' | 'new-account' | 'log-in-required' | 'ready-to-accept';

@Component({
  selector: 'app-accept-invitation-page',
  imports: [ReactiveFormsModule, Button, TextField],
  templateUrl: './accept-invitation.page.html',
  styleUrl: './accept-invitation.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcceptInvitationPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly invitationsService = inject(InvitationsService);
  protected readonly authService = inject(AuthService);

  protected readonly token = this.route.snapshot.paramMap.get('token')!;

  protected readonly state = signal<PageState>('loading');
  protected readonly invitation = signal<InvitationLookup | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const invitation = await this.invitationsService.lookup(this.token);
      this.invitation.set(invitation);
      if (invitation.requiresNewAccount) {
        this.state.set('new-account');
      } else if (this.authService.currentUser()?.email === invitation.email) {
        this.state.set('ready-to-accept');
      } else {
        this.state.set('log-in-required');
      }
    } catch {
      this.state.set('error');
    }
  }

  protected async submitNewAccount(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const response = await this.invitationsService.accept(this.token, this.form.getRawValue());
      if (response.accessToken) {
        await this.authService.applyAccessToken(response.accessToken);
      }
      await this.router.navigateByUrl('/collaborators');
    } catch {
      this.errorMessage.set('Une erreur est survenue, réessayez.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected async acceptAsCurrentUser(): Promise<void> {
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.invitationsService.accept(this.token, {});
      await this.authService.loadProfile();
      await this.router.navigateByUrl('/collaborators');
    } catch {
      this.errorMessage.set('Une erreur est survenue, réessayez.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected goToLogin(): void {
    void this.router.navigate(['/login'], {
      queryParams: { returnUrl: `/accept-invitation/${this.token}` },
    });
  }
}
