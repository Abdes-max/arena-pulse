import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { LanguageService } from 'design-tokens';
import type { CompetitionPhase, CompetitionPhaseType, Match, RoundLabelLang } from 'shared-models';
import { groupMatchesByPhaseSection, roundLabel } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { OrganizerCategory, OrganizerStandingRule } from '../../core/models';
import { OrganizerScoresService } from '../../core/scores.service';
import { TournamentCreationService } from '../../core/tournament-creation.service';

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

// Native port of apps/web/src/app/admin/pages/scores/scores.page.ts (PR 4,
// "parité complète admin web <-> mobile" -- see the plan file's own "PR 4+"
// section). Same round-grouping via shared-models' groupMatchesByPhaseSection
// (no new grouping logic to write), same already-existing scores.controller.ts
// endpoints -- no backend change. The web page's dense HTML table markup is
// swapped for stacked cards (same direction PR #105 already took for admin
// web's own responsive layout), but the TS logic below is otherwise a very
// close port.
@Component({
  selector: 'app-organizer-scores-page',
  imports: [Button, IonContent, IonHeader, IonTitle, IonToolbar, Select, TextField, TranslocoPipe],
  templateUrl: './scores.page.html',
  styleUrl: './scores.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerScoresPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(OrganizerAuthService);
  private readonly creationApi = inject(TournamentCreationService);
  private readonly scoresApi = inject(OrganizerScoresService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly organizationId = computed(() => this.auth.organizations()[0]?.id ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('id')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly forbidden = signal(false);

  protected readonly categories = signal<OrganizerCategory[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseType = signal<CompetitionPhaseType | 'ALL'>('GROUP_STAGE');
  protected readonly matches = signal<Match[]>([]);
  protected readonly standingRulesByGroup = signal<Map<string, OrganizerStandingRule>>(new Map());
  protected readonly scoreDrafts = signal<Map<string, ScoreDraft>>(new Map());

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly groupStagePhase = computed(
    () => this.phases().find((phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase) ?? null,
  );
  protected readonly knockoutPhases = computed(() =>
    this.phases()
      .filter((phase) => phase.type === 'KNOCKOUT')
      .sort((a, b) => a.position - b.position),
  );
  protected readonly phaseTypeOptions = computed<SelectOption[]>(() => {
    const lang = this.languageService.language();
    const options: SelectOption[] = [];
    if (this.groupStagePhase() || this.knockoutPhases().length > 0) {
      options.push({
        value: 'ALL',
        label: this.transloco.translate('organizer.scores.allOption', {}, lang),
      });
    }
    if (this.groupStagePhase()) {
      options.push({
        value: 'GROUP_STAGE',
        label: this.transloco.translate('organizer.scores.poolsOption', {}, lang),
      });
    }
    if (this.knockoutPhases().length > 0) {
      options.push({
        value: 'KNOCKOUT',
        label: this.transloco.translate('organizer.scores.knockoutOption', {}, lang),
      });
    }
    return options;
  });

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

  protected readonly matchesByRoundSection = computed<ScoreSection[]>(() => {
    const lang = this.languageService.language() as RoundLabelLang;
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
      for (const section of groupMatchesByPhaseSection(groupPhase, poolMatches, lang)) {
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
          sections.push({ label: roundLabel(fromEnd, lang), subgroups });
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
        sections.push({
          label: this.transloco.translate('organizer.scores.thirdPlace', {}, lang),
          subgroups: thirdPlaceSubgroups,
        });
      }
    }

    return sections;
  });

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
    } catch (error) {
      this.handleLoadError(error);
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
    this.matches.set([]);
    try {
      const phases = await this.creationApi.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);
      if (phases.length > 0) {
        this.selectedPhaseType.set(this.groupStagePhase() ? 'GROUP_STAGE' : 'KNOCKOUT');
        await this.onPhaseSelected();
      }
    } catch (error) {
      this.handleLoadError(error);
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
    const organizationId = this.organizationId();
    const phases = this.activePhases();
    if (!organizationId || phases.length === 0) {
      this.matches.set([]);
      return;
    }
    try {
      const results = await Promise.all(
        phases.map((phase) =>
          this.scoresApi.listMatches(organizationId, this.tournamentId, phase.id),
        ),
      );
      this.matches.set(results.flat());
    } catch (error) {
      this.handleLoadError(error);
    }
  }

  private async loadStandingRules(): Promise<void> {
    const organizationId = this.organizationId();
    const phase = this.groupStagePhase();
    if (!organizationId || !phase) {
      this.standingRulesByGroup.set(new Map());
      return;
    }
    try {
      const entries = await Promise.all(
        phase.groups.map(
          async (group) =>
            [
              group.id,
              await this.scoresApi.getStandingRule(organizationId, this.tournamentId, group.id),
            ] as const,
        ),
      );
      this.standingRulesByGroup.set(new Map(entries));
    } catch {
      // Standing rules only decide whether to require a penalty shootout;
      // leaving the map empty just skips that requirement.
    }
  }

  private handleLoadError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.forbidden.set(true);
      return;
    }
    this.errorMessage.set('organizer.scores.errors.loadGeneric');
  }

  protected penaltyShootoutEnabled(match: Match): boolean {
    if (!match.groupId) {
      return false;
    }
    return this.standingRulesByGroup().get(match.groupId)?.penaltyShootoutEnabled ?? false;
  }

  protected matchTimeLabel(match: Match): string {
    return match.timeSlot
      ? new Date(match.timeSlot.startTime).toLocaleString(this.languageService.language(), {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : this.transloco.translate('organizer.scores.noSlot', {}, this.languageService.language());
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
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    const draft = this.draftFor(match);
    if (draft.home === '' || draft.away === '') {
      this.errorMessage.set('organizer.scores.errors.enterBothScores');
      return;
    }
    const hasPenalty = draft.homePenalty !== '' || draft.awayPenalty !== '';
    this.errorMessage.set(null);
    try {
      const updated = await this.scoresApi.upsertScore(
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
          ? 'organizer.scores.errors.matchForfeited'
          : 'organizer.scores.errors.saveGeneric',
      );
    }
  }

  protected async validateScore(match: Match): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      await this.scoresApi.validateScore(organizationId, this.tournamentId, match.id);
      // Not just replaceMatch(updated): validating the last match of a
      // knockout round resolves the next round's real opponents (or the
      // 3rd-place match) server-side -- a full reload picks up the new
      // homeTeam/awayTeam on those already-listed placeholder matches.
      await this.loadMatches();
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 400
          ? ((error.error as { message?: string })?.message ??
              'organizer.scores.errors.penaltyShootoutRequired')
          : 'organizer.scores.errors.validateGeneric',
      );
    }
  }

  protected async clearScore(match: Match): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const updated = await this.scoresApi.clearScore(organizationId, this.tournamentId, match.id);
      this.replaceMatch(updated);
      this.clearDraft(match.id);
    } catch {
      this.errorMessage.set('organizer.scores.errors.clearGeneric');
    }
  }

  protected async undoForfeit(match: Match): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const updated = await this.scoresApi.undoForfeit(organizationId, this.tournamentId, match.id);
      this.replaceMatch(updated);
    } catch {
      this.errorMessage.set('organizer.scores.errors.undoForfeitGeneric');
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
