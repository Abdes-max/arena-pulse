import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Logo } from 'design-system';
import { OrganizerAuthService } from '../../core/auth.service';

// Deliberately minimal for now -- closes the auth loop (feat/193 PR 1:
// register -> verify -> login -> land somewhere real) end-to-end so it's
// testable on its own. The actual "Mes tournois" list + "+ Nouveau tournoi"
// creation wizard (see the approved mockup) is the next PR, built on top of
// this guarded route rather than inside it.
@Component({
  selector: 'app-organizer-tournaments-page',
  imports: [IonContent, Button, Logo, TranslocoPipe],
  templateUrl: './tournaments.page.html',
  styleUrl: './tournaments.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerTournamentsPage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.currentUser;
  protected readonly organizations = this.auth.organizations;

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/organizer/login');
  }
}
