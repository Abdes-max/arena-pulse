import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AssetUrlService } from 'api-client';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import {
  Category,
  CompetitionPhase,
  CompetitionPhaseType,
  Match,
  StandingRule,
} from '../../core/models';
import { ScheduleService } from '../../core/schedule.service';
import { ScoresService } from '../../core/scores.service';
import { TournamentsService } from '../../core/tournaments.service';
import { groupMatchesByPhaseSection, roundLabel } from 'shared-models';

interface ScoreDraft {
  home: string;
  away: string;
  homePenalty: string;
  awayPenalty: string;
}

const EMPTY_DRAFT: ScoreDraft = { home: '', away: '', homePenalty: '', awayPenalty: '' };

interface ScoreSubgroup {
  // The tier's own name (e.g. "LDC") when more than one knockout bracket
  // contributes to this round -- null when there's nothing to disambiguate.
  label: string | null;
  matches: Match[];
}

interface ScoreSection {
  label: string;
  subgroups: ScoreSubgroup[];
}

@Component({
  selector: 'app-scores-page',
  imports: [Button, Select, TextField],
  templateUrl: './scores.page.html',
  styleUrl: './scores.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoresPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly scheduleService = inject(ScheduleService);
  private readonly scoresService = inject(ScoresService);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  // Tous, Poules, or Éliminations directes -- never an individual named
  // phase, since with several knockout tiers (LDC, EP, CF...) listing each
  // one by name doesn't group naturally; matches from every contributing
  // phase are merged and sectioned by round (see matchesByRoundSection).
  protected readonly selectedPhaseType = signal<CompetitionPhaseType | 'ALL'>('GROUP_STAGE');
  protected readonly matches = signal<Match[]>([]);
  protected readonly standingRulesByGroup = signal<Map<string, StandingRule>>(new Map());
  protected readonly scoreDrafts = signal<Map<string, ScoreDraft>>(new Map());

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  // Excludes the fictitious pool phase a KNOCKOUT_ONLY structure preset
  // creates to seed its bracket from (isSeedPhase) -- it never has matches,
  // so treating it as a real pool phase here would offer a useless "Poules"
  // filter option. Same fix as schedule.page.ts's own groupStagePhase.
  protected readonly groupStagePhase = computed(
    () => this.phases().find((phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase) ?? null,
  );
  protected readonly knockoutPhases = computed(() =>
    this.phases()
      .filter((phase) => phase.type === 'KNOCKOUT')
      .sort((a, b) => a.position - b.position),
  );
  protected readonly phaseTypeOptions = computed<SelectOption[]>(() => {
    const options: SelectOption[] = [];
    if (this.groupStagePhase() || this.knockoutPhases().length > 0) {
      options.push({ value: 'ALL', label: 'Tous' });
    }
    if (this.groupStagePhase()) {
      options.push({ value: 'GROUP_STAGE', label: 'Poules' });
    }
    if (this.knockoutPhases().length > 0) {
      options.push({ value: 'KNOCKOUT', label: 'Éliminations directes' });
    }
    return options;
  });
  // Phases contributing matches to the current filter -- both for GROUP_STAGE/KNOCKOUT and 'ALL'.
  private activePhases(): CompetitionPhase[] {
    const type = this.selectedPhaseType();
    const groupPhase = this.groupStagePhase();
    if (type === 'GROUP_STAGE') {
      return groupPhase ? [groupPhase] : [];
    }
    if (type === 'KNOCKOUT') {
      return this.knockoutPhases();
    }
    return [...(groupPhase ? [groupPhase] : []), ...this.knockoutPhases()];
  }
  // Resolved from the match itself (not the current filter) -- needed as-is
  // for 'ALL'/'KNOCKOUT' with several tiers, where matches from more than
  // one phase are shown together.
  private phaseForMatch(match: Match): CompetitionPhase | undefined {
    if (match.knockoutBracketId) {
      return this.knockoutPhases().find(
        (phase) => phase.knockoutBracket?.id === match.knockoutBracketId,
      );
    }
    return this.groupStagePhase() ?? undefined;
  }

  protected readonly progress = computed(() => {
    const matches = this.matches();
    const entered = matches.filter((match) => match.score !== null).length;
    return { entered, total: matches.length };
  });

  // Sections grouped by round instead of by exact time slot -- each match
  // row shows its own date/time, since a round/section can span several
  // different slots. Knockout sections are ordered by distance-from-final
  // (1/8, 1/4, 1/2, Finale) across every contributing tier together --
  // same order Calendrier generates them in (BracketsService.
  // generateAllMatches) -- rather than one tier's whole bracket before the
  // next; with more than one tier, each round splits into one subgroup per
  // tier (its own name as a sub-heading) so "Quart de finale" from LDC and
  // EP don't collapse into one ambiguous list.
  protected readonly matchesByRoundSection = computed<ScoreSection[]>(() => {
    const phases = this.activePhases();
    const matches = this.matches();
    const groupPhase = phases.find((phase) => phase.type === 'GROUP_STAGE') ?? null;
    const knockoutTiers = phases.filter(
      (phase) => phase.type === 'KNOCKOUT' && phase.knockoutBracket,
    );
    const sections: ScoreSection[] = [];

    if (groupPhase) {
      const poolMatches = matches.filter(
        (match) => this.phaseForMatch(match)?.id === groupPhase.id,
      );
      for (const section of groupMatchesByPhaseSection(groupPhase, poolMatches)) {
        sections.push({
          label: section.label,
          subgroups: [{ label: null, matches: this.sortByTime(section.matches) }],
        });
      }
    }

    if (knockoutTiers.length > 0) {
      const multipleTiers = knockoutTiers.length > 1;
      const maxTotalRounds = Math.max(
        ...knockoutTiers.map((phase) => Math.log2(phase.knockoutBracket!.size)),
      );

      for (let fromEnd = maxTotalRounds - 1; fromEnd >= 0; fromEnd--) {
        const subgroups: ScoreSubgroup[] = [];
        for (const phase of knockoutTiers) {
          const totalRounds = Math.log2(phase.knockoutBracket!.size);
          const round = totalRounds - fromEnd;
          if (round < 1 || round > totalRounds) {
            continue;
          }
          const roundMatches = matches.filter(
            (match) =>
              !match.isThirdPlaceMatch &&
              match.round === round &&
              this.phaseForMatch(match)?.id === phase.id,
          );
          if (roundMatches.length > 0) {
            subgroups.push({
              label: multipleTiers ? phase.name : null,
              matches: this.sortByTime(roundMatches),
            });
          }
        }
        if (subgroups.length > 0) {
          sections.push({ label: roundLabel(fromEnd), subgroups });
        }
      }

      const thirdPlaceSubgroups = knockoutTiers
        .map((phase) => ({
          label: multipleTiers ? phase.name : null,
          matches: this.sortByTime(
            matches.filter(
              (match) => match.isThirdPlaceMatch && this.phaseForMatch(match)?.id === phase.id,
            ),
          ),
        }))
        .filter((subgroup) => subgroup.matches.length > 0);
      if (thirdPlaceSubgroups.length > 0) {
        sections.push({ label: 'Pour la 3e place', subgroups: thirdPlaceSubgroups });
      }
    }

    return sections;
  });

  // Fully deterministic (never just startTime) -- validateScore reloads every
  // match from the API (see its comment below), and without a tiebreaker two
  // matches kicking off at the same time on different fields could swap
  // places on every such reload (nothing guarantees a stable row order back
  // from the API), which is exactly the "matches keep moving around" bug
  // this was reported against. match.id as the final tiebreaker guarantees
  // the same order every time, even for two still-unscheduled matches.
  private sortByTime(matches: Match[]): Match[] {
    return [...matches].sort((a, b) => {
      if (!a.timeSlot && !b.timeSlot) {
        return a.id.localeCompare(b.id);
      }
      if (!a.timeSlot) {
        return 1;
      }
      if (!b.timeSlot) {
        return -1;
      }
      const byTime = a.timeSlot.startTime.localeCompare(b.timeSlot.startTime);
      if (byTime !== 0) {
        return byTime;
      }
      const byField = a.timeSlot.field.name.localeCompare(b.timeSlot.field.name);
      return byField !== 0 ? byField : a.id.localeCompare(b.id);
    });
  }

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
    this.matches.set([]);
    try {
      const phases = await this.competitionFormatsService.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);
      if (phases.length > 0) {
        this.selectedPhaseType.set(this.groupStagePhase() ? 'GROUP_STAGE' : 'KNOCKOUT');
        await this.onPhaseSelected();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les phases.');
    }
  }

  protected async onPhaseTypeChange(type: string): Promise<void> {
    this.selectedPhaseType.set(type as CompetitionPhaseType | 'ALL');
    await this.onPhaseSelected();
  }

  private async onPhaseSelected(): Promise<void> {
    await Promise.all([this.loadMatches(), this.loadStandingRules()]);
  }

  private async loadMatches(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phases = this.activePhases();
    if (!organizationId || phases.length === 0) {
      this.matches.set([]);
      return;
    }
    try {
      const results = await Promise.all(
        phases.map((phase) =>
          this.scheduleService.listMatches(organizationId, this.tournamentId, phase.id),
        ),
      );
      // Matches with undecided opponents are shown too (placeholder labels,
      // same as Calendrier) so the organizer can see what's coming -- just
      // not scoreable yet, see the template's pendingOpponents() guard.
      this.matches.set(results.flat());
    } catch {
      this.errorMessage.set('Impossible de charger les matchs.');
    }
  }

  private async loadStandingRules(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phase = this.groupStagePhase();
    if (!organizationId || !phase) {
      this.standingRulesByGroup.set(new Map());
      return;
    }
    const groupIds = phase.groups.map((group) => group.id);
    try {
      const entries = await Promise.all(
        groupIds.map(
          async (groupId) =>
            [
              groupId,
              await this.competitionFormatsService.getStandingRule(
                organizationId,
                this.tournamentId,
                groupId,
              ),
            ] as const,
        ),
      );
      this.standingRulesByGroup.set(new Map(entries));
    } catch {
      // Standing rules are only needed to decide whether to require a penalty
      // shootout; leaving the map empty just skips that requirement.
    }
  }

  protected penaltyShootoutEnabled(match: Match): boolean {
    if (!match.groupId) {
      return false;
    }
    return this.standingRulesByGroup().get(match.groupId)?.penaltyShootoutEnabled ?? false;
  }

  protected formatSlotTime(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected matchTimeLabel(match: Match): string {
    return match.timeSlot ? this.formatSlotTime(match.timeSlot.startTime) : 'Sans créneau';
  }

  protected draftFor(match: Match): ScoreDraft {
    const draft = this.scoreDrafts().get(match.id);
    if (draft) {
      return draft;
    }
    if (match.score) {
      return {
        home: String(match.score.homeScore),
        away: String(match.score.awayScore),
        homePenalty:
          match.score.homePenaltyScore !== null ? String(match.score.homePenaltyScore) : '',
        awayPenalty:
          match.score.awayPenaltyScore !== null ? String(match.score.awayPenaltyScore) : '',
      };
    }
    return EMPTY_DRAFT;
  }

  protected pendingOpponents(match: Match): boolean {
    return !match.homeTeam || !match.awayTeam;
  }

  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url);
  }

  protected isDraw(match: Match): boolean {
    const draft = this.draftFor(match);
    return draft.home !== '' && draft.away !== '' && draft.home === draft.away;
  }

  protected onDraftChange(match: Match, key: keyof ScoreDraft, value: string): void {
    this.scoreDrafts.update((drafts) => {
      const next = new Map(drafts);
      next.set(match.id, { ...this.draftFor(match), [key]: value });
      return next;
    });
  }

  protected async saveScore(match: Match): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    const draft = this.draftFor(match);
    if (draft.home === '' || draft.away === '') {
      this.errorMessage.set(
        'Renseignez les deux scores (domicile et extérieur) avant d’enregistrer.',
      );
      return;
    }
    const hasPenalty = draft.homePenalty !== '' || draft.awayPenalty !== '';
    this.errorMessage.set(null);
    try {
      const updated = await this.scoresService.upsertScore(
        organizationId,
        this.tournamentId,
        match.id,
        {
          homeScore: Number(draft.home),
          awayScore: Number(draft.away),
          homePenaltyScore: hasPenalty ? Number(draft.homePenalty) : undefined,
          awayPenaltyScore: hasPenalty ? Number(draft.awayPenalty) : undefined,
        },
      );
      this.replaceMatch(updated);
      this.clearDraft(match.id);
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Ce match est déclaré forfait — annulez le forfait avant de saisir un score.'
          : "Impossible d'enregistrer ce score, vérifiez les valeurs saisies.",
      );
    }
  }

  protected async validateScore(match: Match): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      await this.scoresService.validateScore(organizationId, this.tournamentId, match.id);
      // Not just replaceMatch(updated): validating the last match of a
      // knockout round resolves the next round's real opponents (or
      // 3rd-place match) server-side -- those matches are already in
      // this.matches (shown with placeholder labels while undetermined),
      // but only a full reload picks up their new homeTeam/awayTeam,
      // whatever the bracket's size (round of 32, 16, quarters...).
      await this.loadMatches();
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 400
          ? ((error.error as { message?: string })?.message ??
              'Une séance de tirs au but est requise pour valider ce match nul.')
          : 'Impossible de valider ce score.',
      );
    }
  }

  protected async clearScore(match: Match): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const updated = await this.scoresService.clearScore(
        organizationId,
        this.tournamentId,
        match.id,
      );
      this.replaceMatch(updated);
      this.clearDraft(match.id);
    } catch {
      this.errorMessage.set('Impossible d’effacer ce score.');
    }
  }

  protected async undoForfeit(match: Match): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const updated = await this.scoresService.undoForfeit(
        organizationId,
        this.tournamentId,
        match.id,
      );
      this.replaceMatch(updated);
    } catch {
      this.errorMessage.set('Impossible d’annuler ce forfait.');
    }
  }

  private replaceMatch(updated: Match): void {
    this.matches.update((matches) =>
      matches.map((match) => (match.id === updated.id ? updated : match)),
    );
  }

  private clearDraft(matchId: string): void {
    this.scoreDrafts.update((drafts) => {
      const next = new Map(drafts);
      next.delete(matchId);
      return next;
    });
  }
}
