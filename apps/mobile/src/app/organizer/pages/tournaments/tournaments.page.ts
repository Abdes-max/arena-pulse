import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, Logo } from 'design-system';
import { OrganizerAuthService } from '../../core/auth.service';
import { OrganizerTournament } from '../../core/models';
import { OrganizerTournamentsService } from '../../core/tournaments.service';

// Real "Mes tournois" list -- replaces the PR 1 placeholder (register ->
// verify -> login -> land somewhere real) now that the creation wizard
// (tournament-wizard.page.ts) gives this a genuine destination. Mirrors the
// mockup's "Écran 3" (adaptive-leaping-elephant.md, Étape 0): a card per
// tournament with a status badge + sport, a floating "+ Nouveau tournoi"
// button, and (PR 4) two small actions per card for Scores/Classements.
// Tapping the card body itself opens the wizard in edit mode (feat/193 PR
// 3, openTournament() below). Remaining admin-web-only pages (arbitres,
// structure/calendrier manual editing, sponsors...) are tracked as PR 5+
// in the plan file's "PR 4+ -- parité complète" section.
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
   * Native edit mode (feat/193 PR 3) -- same wizard component as "Créer un
   * tournoi", reading the route's 'id' param to preload this tournament's
   * data instead of starting from scratch (see tournament-wizard.page.ts's
   * own doc comment). Used to bounce out to the admin-web page in the
   * system browser; the richer editor (arbitres, scores, classement...)
   * genuinely stays admin-web-only, but the organizer no longer leaves the
   * app just to rename a tournament or add a team.
   */
  protected async openTournament(tournament: OrganizerTournament): Promise<void> {
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/edit`);
  }

  /** PR 4 -- card action, stops propagation so it doesn't also trigger openTournament() above. */
  protected async openScores(event: Event, tournament: OrganizerTournament): Promise<void> {
    event.stopPropagation();
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/scores`);
  }

  /** PR 4 -- same as openScores() above. */
  protected async openStandings(event: Event, tournament: OrganizerTournament): Promise<void> {
    event.stopPropagation();
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/standings`);
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
