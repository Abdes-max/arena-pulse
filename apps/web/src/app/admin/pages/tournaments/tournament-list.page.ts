import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Badge, BadgeStatus, Button } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { Tournament, TournamentStatus } from '../../core/models';
import { TeamsService } from '../../core/teams.service';
import { TournamentsService } from '../../core/tournaments.service';
import { OnboardingChecklist, OnboardingStep } from './onboarding-checklist';

const STATUS_TO_BADGE: Record<TournamentStatus, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

const DISMISSED_STORAGE_PREFIX = 'arena-pulse:onboarding-dismissed:';

@Component({
  selector: 'app-tournament-list-page',
  imports: [Badge, Button, OnboardingChecklist],
  templateUrl: './tournament-list.page.html',
  styleUrl: './tournament-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentListPage {
  private readonly tournamentsService = inject(TournamentsService);
  private readonly teamsService = inject(TeamsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly statusBadge = STATUS_TO_BADGE;

  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly hasTeam = signal(false);
  private readonly hasStructure = signal(false);
  private readonly onboardingDismissed = signal(false);

  protected readonly onboardingSteps = computed<OnboardingStep[]>(() => {
    const tournaments = this.tournaments();
    return [
      {
        key: 'create-tournament',
        title: 'Créer votre premier tournoi',
        description: 'Nom, sport et dates de votre compétition.',
        done: tournaments.length > 0,
        actionLabel: 'Créer',
      },
      {
        key: 'add-team',
        title: 'Ajouter au moins une équipe',
        description: 'Sur votre tournoi le plus récent.',
        done: this.hasTeam(),
        actionLabel: 'Ajouter',
      },
      {
        key: 'structure',
        title: 'Structurer votre tournoi',
        description: 'Poules et/ou tableaux à élimination.',
        done: this.hasStructure(),
        actionLabel: 'Structurer',
      },
      {
        key: 'publish',
        title: 'Publier le tournoi',
        description: 'Rendre son site public visible.',
        done: tournaments.some((tournament) => tournament.status === 'PUBLISHED'),
        actionLabel: 'Publier',
      },
    ];
  });

  protected readonly showOnboarding = computed(
    () => !this.onboardingDismissed() && this.onboardingSteps().some((step) => !step.done),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.onboardingDismissed.set(
      localStorage.getItem(DISMISSED_STORAGE_PREFIX + organizationId) === '1',
    );
    this.loading.set(true);
    try {
      const tournaments = await this.tournamentsService.listTournaments(organizationId);
      this.tournaments.set(tournaments);
      await this.loadOnboardingSignals(organizationId, tournaments);
    } catch {
      this.errorMessage.set('Impossible de charger les tournois.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadOnboardingSignals(
    organizationId: string,
    tournaments: Tournament[],
  ): Promise<void> {
    const latest = tournaments[0];
    if (!latest) {
      return;
    }
    try {
      const [teams, categories] = await Promise.all([
        this.teamsService.listTeams(organizationId, latest.id),
        this.tournamentsService.listCategories(organizationId, latest.id),
      ]);
      this.hasTeam.set(teams.length > 0);
      this.hasStructure.set(categories.length > 0);
    } catch {
      // Onboarding hints are best-effort — a failure here shouldn't block the dashboard.
    }
  }

  protected dismissOnboarding(): void {
    const organizationId = this.organization()?.id;
    if (organizationId) {
      localStorage.setItem(DISMISSED_STORAGE_PREFIX + organizationId, '1');
    }
    this.onboardingDismissed.set(true);
  }

  protected onOnboardingStepClick(stepKey: string): void {
    const latest = this.tournaments()[0];
    switch (stepKey) {
      case 'create-tournament':
        this.goToCreate();
        break;
      case 'add-team':
        if (latest) {
          void this.router.navigate(['/admin/tournaments', latest.id, 'teams']);
        }
        break;
      case 'structure':
        if (latest) {
          void this.router.navigate(['/admin/tournaments', latest.id, 'structure']);
        }
        break;
      case 'publish':
        if (latest) {
          void this.router.navigate(['/admin/tournaments', latest.id]);
        }
        break;
    }
  }

  protected goToCreate(): void {
    void this.router.navigateByUrl('/admin/tournaments/new');
  }

  protected editTournament(tournament: Tournament): void {
    void this.router.navigate(['/admin/tournaments', tournament.id]);
  }

  protected publicUrl(tournament: Tournament): string {
    return `/${tournament.slug}`;
  }

  protected async duplicate(tournament: Tournament): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.tournamentsService.duplicate(organizationId, tournament.id);
      await this.load();
    } catch {
      this.errorMessage.set('Impossible de dupliquer ce tournoi.');
    }
  }

  protected async toggleArchive(tournament: Tournament): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      if (tournament.status === 'ARCHIVED') {
        await this.tournamentsService.unarchive(organizationId, tournament.id);
      } else {
        await this.tournamentsService.archive(organizationId, tournament.id);
      }
      await this.load();
    } catch {
      this.errorMessage.set("Impossible de modifier l'état de ce tournoi.");
    }
  }
}
