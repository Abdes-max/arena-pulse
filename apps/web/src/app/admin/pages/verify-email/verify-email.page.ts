import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Logo } from 'design-system';
import { AuthService } from '../../core/auth.service';

type PageState = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-verify-email-page',
  imports: [RouterLink, Logo],
  templateUrl: './verify-email.page.html',
  styleUrl: './verify-email.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyEmailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  protected readonly token = this.route.snapshot.paramMap.get('token')!;

  protected readonly state = signal<PageState>('loading');
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.verify();
  }

  private async verify(): Promise<void> {
    try {
      await this.authService.verifyEmail(this.token);
      this.state.set('success');
      await this.router.navigateByUrl('/admin/tournaments');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.errorMessage.set('Ce lien de vérification est invalide, expiré ou déjà utilisé.');
      } else {
        this.errorMessage.set('Une erreur est survenue, réessayez.');
      }
      this.state.set('error');
    }
  }
}
