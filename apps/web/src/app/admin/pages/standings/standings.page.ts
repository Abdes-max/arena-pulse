import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AssetUrlService } from 'api-client';
import { Badge, Button, Select, SelectOption } from 'design-system';
import { AuthService } from '../../core/auth.service';
import {
  CompetitionFormatsService,
  CrossGroupUnresolvedTie,
} from '../../core/competition-formats.service';
import { Category, CompetitionPhase, Qualification, Standings } from '../../core/models';
import { StandingsService } from '../../core/standings.service';
import { TournamentsService } from '../../core/tournaments.service';
import { qualificationTierColor, QualificationTierColor } from 'shared-models';

interface QualificationTier {
  label: string;
  color: string;
  soft: string;
}

interface GroupStandings {
  groupId: string;
  groupName: string;
  standings: Standings;
  qualifications: Qualification[];
}

@Component({
  selector: 'app-standings-page',
  imports: [Badge, Button, DecimalPipe, Select],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly standingsService = inject(StandingsService);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly groupStandings = signal<GroupStandings[]>([]);
  // Cross-group (inter-poule) ties -- distinct from a pool's own
  // group.standings.unresolvedTies, since these involve candidates from
  // several pools at once (e.g. "best 3rd place") rather than one pool's
  // own row order.
  protected readonly crossGroupTies = signal<CrossGroupUnresolvedTie[]>([]);

  protected readonly groupStagePhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'GROUP_STAGE'),
  );

  // Every KNOCKOUT phase in this category, in tournament order -- used to
  // color-code and label the "Qualifié" badge once a pool's teams can be
  // routed to more than one tier (e.g. 1-2 -> LDC, 3-4 -> EP, 5 -> CF).
  // Doesn't require the bracket to already be generated (unlike a bracket
  // display would), since a QualificationRule can target a phase before its
  // bracket exists.
  protected readonly qualificationTierPhases = computed(() =>
    this.phases()
      .filter((phase) => phase.type === 'KNOCKOUT')
      .sort((a, b) => a.position - b.position),
  );

  private readonly tierColorByPhaseId = computed(() => {
    const tiers = this.qualificationTierPhases();
    const map = new Map<string, QualificationTierColor>();
    tiers.forEach((phase, index) => {
      map.set(phase.id, qualificationTierColor(index, tiers.length));
    });
    return map;
  });

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly phaseOptions = computed<SelectOption[]>(() =>
    this.groupStagePhases().map((phase) => ({ value: phase.id, label: phase.name })),
  );

  constructor() {
    void this.loadCategories();
  }

  private async loadCategories(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const categories = await this.tournamentsService.listCategories(
        organizationId,
        this.tournamentId,
      );
      this.categories.set(categories);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadPhases();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les catégories.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadPhases();
  }

  private async loadPhases(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    this.selectedPhaseId.set('');
    this.groupStandings.set([]);
    try {
      const phases = await this.competitionFormatsService.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);
      const firstGroupStage = phases.find((phase) => phase.type === 'GROUP_STAGE');
      if (firstGroupStage) {
        this.selectedPhaseId.set(firstGroupStage.id);
        await this.loadStandings();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les phases.');
    }
  }

  protected async onPhaseChange(phaseId: string): Promise<void> {
    this.selectedPhaseId.set(phaseId);
    await this.loadStandings();
  }

  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url);
  }

  protected isQualified(group: GroupStandings, teamId: string): boolean {
    return group.qualifications.some((qualification) =>
      qualification.qualifiedTeams.some((team) => team.id === teamId),
    );
  }

  // Only meaningful once there's more than one knockout tier -- with just
  // one, the generic "Qualifié" badge (isQualified above) already says all
  // there is to say, no need to name it.
  protected qualificationTier(group: GroupStandings, teamId: string): QualificationTier | null {
    if (this.qualificationTierPhases().length < 2) {
      return null;
    }
    const qualification = group.qualifications.find((qual) =>
      qual.qualifiedTeams.some((team) => team.id === teamId),
    );
    if (!qualification) {
      return null;
    }
    const tierColor = this.tierColorByPhaseId().get(qualification.targetPhaseId);
    return tierColor ? { label: qualification.targetPhaseName, ...tierColor } : null;
  }

  private async loadStandings(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    if (!organizationId || !phase) {
      return;
    }
    try {
      const [groupStandings, crossGroupTies] = await Promise.all([
        Promise.all(
          phase.groups.map(async (group) => ({
            groupId: group.id,
            groupName: group.name,
            standings: await this.standingsService.getStandings(
              organizationId,
              this.tournamentId,
              group.id,
            ),
            qualifications: await this.standingsService.getQualifications(
              organizationId,
              this.tournamentId,
              group.id,
            ),
          })),
        ),
        this.competitionFormatsService.getCrossGroupUnresolvedTies(
          organizationId,
          this.tournamentId,
          phase.id,
        ),
      ]);
      this.groupStandings.set(groupStandings);
      this.crossGroupTies.set(crossGroupTies);
    } catch {
      this.errorMessage.set('Impossible de charger les classements.');
    }
  }

  protected tieOptions(tie: { teams: { id: string; name: string }[] }): SelectOption[] {
    return [
      { value: '', label: 'Choisir…' },
      ...tie.teams.map((team) => ({ value: team.id, label: team.name })),
    ];
  }

  protected async onPoolTieBreakChoice(group: GroupStandings, teamId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || !teamId) {
      return;
    }
    try {
      await this.standingsService.setTieBreakChoice(
        organizationId,
        this.tournamentId,
        group.groupId,
        teamId,
      );
      await this.loadStandings();
    } catch {
      this.errorMessage.set("Impossible d'enregistrer ce choix.");
    }
  }

  protected async onPoolTieBreakClear(group: GroupStandings): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.standingsService.clearTieBreakChoice(
        organizationId,
        this.tournamentId,
        group.groupId,
      );
      await this.loadStandings();
    } catch {
      this.errorMessage.set('Impossible de réinitialiser ce départage.');
    }
  }

  protected async onCrossGroupTieBreakChoice(ruleId: string, teamId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || !teamId) {
      return;
    }
    try {
      await this.competitionFormatsService.setCrossGroupTieBreakChoice(
        organizationId,
        this.tournamentId,
        ruleId,
        teamId,
      );
      await this.loadStandings();
    } catch {
      this.errorMessage.set("Impossible d'enregistrer ce choix.");
    }
  }

  protected async onCrossGroupTieBreakClear(ruleId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.competitionFormatsService.clearCrossGroupTieBreakChoice(
        organizationId,
        this.tournamentId,
        ruleId,
      );
      await this.loadStandings();
    } catch {
      this.errorMessage.set('Impossible de réinitialiser ce départage.');
    }
  }
}
