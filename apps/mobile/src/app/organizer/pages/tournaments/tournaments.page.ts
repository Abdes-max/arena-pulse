import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, Logo } from 'design-system';
import { OrganizerAuthService } from '../../core/auth.service';
import { OrganizerTournament } from '../../core/models';
import { OrganizerTournamentsService } from '../../core/tournaments.service';
import { environment } from '../../../../environments/environment';

// Real "Mes tournois" list -- replaces the PR 1 placeholder (register ->
// verify -> login -> land somewhere real) now that the creation wizard
// (tournament-wizard.page.ts) gives this a genuine destination. Mirrors the
// mockup's "Écran 3" (adaptive-leaping-elephant.md, Étape 0): a card per
// tournament with a status badge + sport, and a floating "+ Nouveau
// tournoi" button. Sponsors/referees/publication-orders/multi-organization
// switching stay out of scope, same as apps/web/src/app/admin's own
// tournament-list.page.ts is far richer than this -- this is the fast
// native "see what I've got, start a new one" view, not the full admin.
@Component({
  selector: 'app-organizer-tournaments-page',
  imports: [Badge, IonContent, IonHeader, IonTitle, IonToolbar, Logo, RouterLink, TranslocoPipe],
  templateUrl: './tournaments.page.html',
  styleUrl: './tournaments.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerTournamentsPage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly tournamentsApi = inject(OrganizerTournamentsService);
  private readonly router = inject(Router);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly transloco = inject(TranslocoService);

  protected readonly user = this.auth.currentUser;
  protected readonly organizations = this.auth.organizations;
  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.organizations()[0]?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const tournaments = await this.tournamentsApi.listTournaments(organizationId);
      this.tournaments.set(tournaments);
    } catch {
      this.errorMessage.set('organizer.tournaments.list.errorGeneric');
    } finally {
      this.loading.set(false);
    }
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  /**
   * No native tournament-management UI yet (teams, structure, calendar,
   * publish/unpublish, personalization -- this list is deliberately just
   * "see what I've got, start a new one", see this class's own doc comment
   * above) -- opens the existing full admin-web page for that tournament in
   * the system browser instead of a dead-end unclickable card, same
   * "no native UI yet" pattern already used for subscription management and
   * the Stripe publication checkout (tournament-wizard.page.ts).
   */
  protected openTournament(tournament: OrganizerTournament): void {
    window.open(`${environment.webUrl}/admin/tournaments/${tournament.id}`, '_blank', 'noopener');
  }

  protected statusLabel(status: OrganizerTournament['status']): string {
    return this.transloco.translate(`organizer.tournaments.list.status.${status}`);
  }

  protected badgeStatus(
    status: OrganizerTournament['status'],
  ): 'draft' | 'published' | 'unpublished' | 'archived' {
    switch (status) {
      case 'PUBLISHED':
        return 'published';
      case 'UNPUBLISHED':
        return 'unpublished';
      case 'ARCHIVED':
        return 'archived';
      default:
        return 'draft';
    }
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/organizer/login');
  }
}
