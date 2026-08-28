import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, BracketMatch, Button, Select, SelectOption } from 'design-system';
import { LanguageService } from 'design-tokens';
import type {
  BracketView,
  CompetitionPhase,
  Match,
  Qualification,
  QualificationTierColor,
  RoundLabelLang,
  Standings,
} from 'shared-models';
import { buildBracketView, computeFinalRanking, qualificationTierColor } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { OrganizerCategory } from '../../core/models';
import { CrossGroupUnresolvedTie, OrganizerStandingsService } from '../../core/standings.service';
import { TournamentCreationService } from '../../core/tournament-creation.service';

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

// Native port of apps/web/src/app/admin/pages/standings/standings.page.ts
// (PR 4, "parité complète admin web <-> mobile") -- same shared-models
// buildBracketView/computeFinalRanking pure functions already used there
// (and by this session's own admin web standings.page.ts rewrite earlier
// today), same already-existing endpoints, no backend change.
@Component({
  selector: 'app-organizer-standings-page',
  imports: [
    Badge,
    BracketMatch,
    Button,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    Select,
    TranslocoPipe,
  ],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerStandingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(OrganizerAuthService);
  private readonly creationApi = inject(TournamentCreationService);
  private readonly standingsApi = inject(OrganizerStandingsService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly organizationId = computed(() => this.auth.organizations()[0]?.id ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('id')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<OrganizerCategory[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly groupStandingsByPhase = signal<Map<string, GroupStandings[]>>(new Map());
  protected readonly groupStandings = computed(
    () => this.groupStandingsByPhase().get(this.selectedPhaseId()) ?? [],
  );
  protected readonly crossGroupTies = signal<CrossGroupUnresolvedTie[]>([]);

  private readonly bracketRawByPhase = signal<
    Map<string, { matches: Match[]; totalRounds: number }>
  >(new Map());
  private readonly finalRankingRaw = signal<{ phase: CompetitionPhase; matches: Match[] }[]>([]);

  protected readonly bracketByPhase = computed(() => {
    const lang = this.languageService.language() as RoundLabelLang;
    const map = new Map<string, BracketView>();
    for (const [phaseId, raw] of this.bracketRawByPhase()) {
      map.set(phaseId, buildBracketView(raw.matches, raw.totalRounds, lang));
    }
    return map;
  });

  protected readonly finalRanking = computed(() =>
    computeFinalRanking(this.finalRankingRaw(), this.languageService.language() as RoundLabelLang),
  );

  protected readonly podium = computed(() => {
    const ranking = this.finalRanking();
    if (ranking.length < 3) {
      return null;
    }
    const [first, second, third] = ranking;
    return { first, second, third };
  });

  protected readonly finalRankingRest = computed(() => {
    const ranking = this.finalRanking();
    return this.podium() ? ranking.slice(3) : ranking;
  });

  protected readonly groupStagePhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase),
  );

  protected readonly knockoutPhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'KNOCKOUT' && phase.knockoutBracket),
  );

  protected readonly isKnockoutOnly = computed(
    () => this.phases().length > 0 && this.groupStagePhases().length === 0,
  );

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
  protected readonly phaseOptions = computed<SelectOption[]>(() => [
    ...this.groupStagePhases().map((phase) => ({ value: phase.id, label: phase.name })),
    ...this.knockoutPhases().map((phase) => ({ value: phase.id, label: phase.name })),
    ...(this.knockoutPhases().length > 0
      ? [
          {
            value: 'final',
            label: this.transloco.translate(
              'organizer.standings.finalRankingTab',
              {},
              this.languageService.language(),
            ),
          },
        ]
      : []),
  ]);

  protected readonly selectedPhaseType = computed<'GROUP_STAGE' | 'KNOCKOUT' | 'final' | null>(
    () => {
      if (this.selectedPhaseId() === 'final') {
        return 'final';
      }
      return this.phases().find((phase) => phase.id === this.selectedPhaseId())?.type ?? null;
    },
  );

  constructor() {
    void this.loadCategories();
  }

  protected async goBack(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }

  private async loadCategories(): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const categories = await this.creationApi.listCategories(organizationId, this.tournamentId);
      this.categories.set(categories);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadPhases();
      }
    } catch {
      this.errorMessage.set('organizer.standings.errors.loadGeneric');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadPhases();
  }

  private async loadPhases(): Promise<void> {
    const organizationId = this.organizationId();
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    this.selectedPhaseId.set('');
    this.groupStandingsByPhase.set(new Map());
    this.bracketRawByPhase.set(new Map());
    this.finalRankingRaw.set([]);
    this.crossGroupTies.set([]);
    try {
      const phases = await this.creationApi.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);

      const groupStandingsByPhase = new Map<string, GroupStandings[]>();
      for (const phase of phases.filter((p) => p.type === 'GROUP_STAGE' && !p.isSeedPhase)) {
        const perGroup = await Promise.all(
          phase.groups.map(async (group) => ({
            groupId: group.id,
            groupName: group.name,
            standings: await this.standingsApi.getStandings(
              organizationId,
              this.tournamentId,
              group.id,
            ),
            qualifications: await this.standingsApi.getQualifications(
              organizationId,
              this.tournamentId,
              group.id,
            ),
          })),
        );
        groupStandingsByPhase.set(phase.id, perGroup);
      }
      this.groupStandingsByPhase.set(groupStandingsByPhase);

      const bracketRawByPhase = new Map<string, { matches: Match[]; totalRounds: number }>();
      const knockoutPhases = phases.filter((p) => p.type === 'KNOCKOUT' && p.knockoutBracket);
      for (const phase of knockoutPhases) {
        const matches = await this.standingsApi.listBracketMatches(
          organizationId,
          this.tournamentId,
          phase.knockoutBracket!.id,
        );
        const totalRounds = Math.log2(phase.knockoutBracket!.size);
        bracketRawByPhase.set(phase.id, { matches, totalRounds });
      }
      this.bracketRawByPhase.set(bracketRawByPhase);
      this.finalRankingRaw.set(
        knockoutPhases.map((phase) => ({
          phase,
          matches: bracketRawByPhase.get(phase.id)?.matches ?? [],
        })),
      );

      const firstGroupStage = phases.find(
        (phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase,
      );
      if (firstGroupStage) {
        this.selectedPhaseId.set(firstGroupStage.id);
        await this.loadCrossGroupTies(firstGroupStage.id);
      } else {
        const firstOption = this.phaseOptions()[0];
        if (firstOption) {
          this.selectedPhaseId.set(firstOption.value);
        }
      }
    } catch {
      this.errorMessage.set('organizer.standings.errors.loadGeneric');
    }
  }

  protected async onPhaseChange(phaseId: string): Promise<void> {
    this.selectedPhaseId.set(phaseId);
    const phase = this.phases().find((p) => p.id === phaseId);
    if (phase?.type === 'GROUP_STAGE') {
      await this.loadCrossGroupTies(phaseId);
    } else {
      this.crossGroupTies.set([]);
    }
  }

  private async loadCrossGroupTies(phaseId: string): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    try {
      this.crossGroupTies.set(
        await this.standingsApi.getCrossGroupUnresolvedTies(
          organizationId,
          this.tournamentId,
          phaseId,
        ),
      );
    } catch {
      this.errorMessage.set('organizer.standings.errors.loadGeneric');
    }
  }

  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url);
  }

  protected isQualified(group: GroupStandings, teamId: string): boolean {
    return group.qualifications.some((qualification) =>
      qualification.qualifiedTeams.some((team) => team.id === teamId),
    );
  }

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
    const organizationId = this.organizationId();
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
            standings: await this.standingsApi.getStandings(
              organizationId,
              this.tournamentId,
              group.id,
            ),
            qualifications: await this.standingsApi.getQualifications(
              organizationId,
              this.tournamentId,
              group.id,
            ),
          })),
        ),
        this.standingsApi.getCrossGroupUnresolvedTies(organizationId, this.tournamentId, phase.id),
      ]);
      this.groupStandingsByPhase.update((map) => new Map(map).set(phase.id, groupStandings));
      this.crossGroupTies.set(crossGroupTies);
    } catch {
      this.errorMessage.set('organizer.standings.errors.loadGeneric');
    }
  }

  protected tieOptions(tie: { teams: { id: string; name: string }[] }): SelectOption[] {
    return [
      {
        value: '',
        label: this.transloco.translate(
          'organizer.standings.chooseOption',
          {},
          this.languageService.language(),
        ),
      },
      ...tie.teams.map((team) => ({ value: team.id, label: team.name })),
    ];
  }

  protected async onPoolTieBreakChoice(group: GroupStandings, teamId: string): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId || !teamId) {
      return;
    }
    try {
      await this.standingsApi.setTieBreakChoice(
        organizationId,
        this.tournamentId,
        group.groupId,
        teamId,
      );
      await this.loadStandings();
    } catch {
      this.errorMessage.set('organizer.standings.errors.saveTieChoice');
    }
  }

  protected async onPoolTieBreakClear(group: GroupStandings): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    try {
      await this.standingsApi.clearTieBreakChoice(organizationId, this.tournamentId, group.groupId);
      await this.loadStandings();
    } catch {
      this.errorMessage.set('organizer.standings.errors.resetTieChoice');
    }
  }

  protected async onCrossGroupTieBreakChoice(ruleId: string, teamId: string): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId || !teamId) {
      return;
    }
    try {
      await this.standingsApi.setCrossGroupTieBreakChoice(
        organizationId,
        this.tournamentId,
        ruleId,
        teamId,
      );
      await this.loadStandings();
    } catch {
      this.errorMessage.set('organizer.standings.errors.saveTieChoice');
    }
  }

  protected async onCrossGroupTieBreakClear(ruleId: string): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    try {
      await this.standingsApi.clearCrossGroupTieBreakChoice(
        organizationId,
        this.tournamentId,
        ruleId,
      );
      await this.loadStandings();
    } catch {
      this.errorMessage.set('organizer.standings.errors.resetTieChoice');
    }
  }
}
