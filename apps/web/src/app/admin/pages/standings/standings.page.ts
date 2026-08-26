import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, BracketMatch, Button, Select, SelectOption } from 'design-system';
import { LanguageService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import {
  CompetitionFormatsService,
  CrossGroupUnresolvedTie,
} from '../../core/competition-formats.service';
import { Category, CompetitionPhase, Match, Qualification, Standings } from '../../core/models';
import { StandingsService } from '../../core/standings.service';
import { TournamentsService } from '../../core/tournaments.service';
import {
  BracketView,
  buildBracketView,
  computeFinalRanking,
  qualificationTierColor,
  QualificationTierColor,
  RoundLabelLang,
} from 'shared-models';

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
  imports: [Badge, BracketMatch, Button, DecimalPipe, Select, TranslocoPipe],
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
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  // '', a phase id, or the synthetic 'final' pseudo-phase (see phaseOptions).
  protected readonly selectedPhaseId = signal('');
  protected readonly groupStandingsByPhase = signal<Map<string, GroupStandings[]>>(new Map());
  protected readonly groupStandings = computed(
    () => this.groupStandingsByPhase().get(this.selectedPhaseId()) ?? [],
  );
  // Cross-group (inter-poule) ties -- distinct from a pool's own
  // group.standings.unresolvedTies, since these involve candidates from
  // several pools at once (e.g. "best 3rd place") rather than one pool's
  // own row order.
  protected readonly crossGroupTies = signal<CrossGroupUnresolvedTie[]>([]);

  // Raw fetched bracket data, kept separate from its presentation --
  // bracketByPhase/finalRanking below are *computed* from this plus the
  // active language, so a language switch re-labels an already-loaded
  // bracket/ranking locally (buildBracketView/computeFinalRanking are pure
  // formatting, no network call) instead of re-fetching just for new round
  // names. Mirrors the public standings page's own equivalent state.
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

  // Every KNOCKOUT phase whose bracket has actually been created -- a
  // KNOCKOUT phase added on Structure but not yet given a bracket has
  // nothing to show here (mirrors the public standings page's own
  // knockoutPhases, which feeds the same "Tableau final" tab).
  protected readonly knockoutPhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'KNOCKOUT' && phase.knockoutBracket),
  );

  // Distinguishes "no phase configured yet" (organizer still needs to visit
  // Structure) from "this category is a valid KNOCKOUT_ONLY structure" (no
  // real pool phase by design) -- the two need different empty-state copy.
  protected readonly isKnockoutOnly = computed(
    () => this.phases().length > 0 && this.groupStagePhases().length === 0,
  );

  // Every KNOCKOUT phase in this category, in tournament order -- used to
  // color-code and label the "Qualifié" badge once a pool's teams can be
  // routed to more than one tier (e.g. 1-2 -> LDC, 3-4 -> EP, 5 -> CF).
  // Doesn't require the bracket to already be generated (unlike knockoutPhases
  // above), since a QualificationRule can target a phase before its bracket
  // exists.
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
  // Every selectable "view" for this category: each pool phase, each
  // knockout tier, and -- once there's at least one knockout tier -- a
  // synthetic 'final' entry for the podium/final-ranking view. Matches the
  // public standings page's own tabs computed 1:1.
  protected readonly phaseOptions = computed<SelectOption[]>(() => [
    ...this.groupStagePhases().map((phase) => ({ value: phase.id, label: phase.name })),
    ...this.knockoutPhases().map((phase) => ({ value: phase.id, label: phase.name })),
    ...(this.knockoutPhases().length > 0
      ? [
          {
            value: 'final',
            label: this.transloco.translate(
              'admin.standings.finalRankingTab',
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
      this.errorMessage.set('admin.standings.errors.loadCategories');
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
    this.groupStandingsByPhase.set(new Map());
    this.bracketRawByPhase.set(new Map());
    this.finalRankingRaw.set([]);
    this.crossGroupTies.set([]);
    try {
      const phases = await this.competitionFormatsService.listPhases(
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
        );
        groupStandingsByPhase.set(phase.id, perGroup);
      }
      this.groupStandingsByPhase.set(groupStandingsByPhase);

      const bracketRawByPhase = new Map<string, { matches: Match[]; totalRounds: number }>();
      const knockoutPhases = phases.filter((p) => p.type === 'KNOCKOUT' && p.knockoutBracket);
      for (const phase of knockoutPhases) {
        const matches = await this.competitionFormatsService.listBracketMatches(
          organizationId,
          this.tournamentId,
          phase.knockoutBracket!.id,
        );
        const totalRounds = Math.log2(phase.knockoutBracket!.size);
        bracketRawByPhase.set(phase.id, { matches, totalRounds });
      }
      this.bracketRawByPhase.set(bracketRawByPhase);
      // Reuses the matches just fetched above for each tier's bracket rather
      // than fetching them a second time just to feed computeFinalRanking.
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
      this.errorMessage.set('admin.standings.errors.loadPhases');
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
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      this.crossGroupTies.set(
        await this.competitionFormatsService.getCrossGroupUnresolvedTies(
          organizationId,
          this.tournamentId,
          phaseId,
        ),
      );
    } catch {
      this.errorMessage.set('admin.standings.errors.loadStandings');
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
      this.groupStandingsByPhase.update((map) => new Map(map).set(phase.id, groupStandings));
      this.crossGroupTies.set(crossGroupTies);
    } catch {
      this.errorMessage.set('admin.standings.errors.loadStandings');
    }
  }

  protected tieOptions(tie: { teams: { id: string; name: string }[] }): SelectOption[] {
    return [
      {
        value: '',
        label: this.transloco.translate(
          'admin.standings.chooseOption',
          {},
          this.languageService.language(),
        ),
      },
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
      this.errorMessage.set('admin.standings.errors.saveTieChoice');
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
      this.errorMessage.set('admin.standings.errors.resetTieChoice');
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
      this.errorMessage.set('admin.standings.errors.saveTieChoice');
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
      this.errorMessage.set('admin.standings.errors.resetTieChoice');
    }
  }
}
