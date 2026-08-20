import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button, TextField } from 'design-system';
import { PlayerAuthService } from '../../../core/player-auth.service';

@Component({
  selector: 'app-player-register-page',
  imports: [ReactiveFormsModule, RouterLink, Button, TextField],
  templateUrl: './player-register.page.html',
  styleUrl: './player-register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerRegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly playerAuthService = inject(PlayerAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.formBuilder.nonNullable.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10)]],
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
      await this.playerAuthService.register(this.form.getRawValue());
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errorMessage.set('Un compte existe déjà avec cet email.');
      } else {
        this.errorMessage.set('Une erreur est survenue, réessayez.');
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
