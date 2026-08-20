import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button, TextField } from 'design-system';
import { PlayerAuthService } from '../../../core/player-auth.service';
import { isSafeReturnUrl } from '../../../core/safe-return-url.util';

@Component({
  selector: 'app-player-login-page',
  imports: [ReactiveFormsModule, RouterLink, Button, TextField],
  templateUrl: './player-login.page.html',
  styleUrl: './player-login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerLoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly playerAuthService = inject(PlayerAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.playerAuthService.login(email, password);
      const requestedReturnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const returnUrl = isSafeReturnUrl(requestedReturnUrl) ? requestedReturnUrl : '/';
      await this.router.navigateByUrl(returnUrl);
    } catch {
      this.errorMessage.set('Email ou mot de passe incorrect.');
    } finally {
      this.submitting.set(false);
    }
  }
}
