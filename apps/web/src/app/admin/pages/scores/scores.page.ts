import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button, Select, SelectOption } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import { Category, CompetitionPhase, Match, StandingRule } from '../../core/models';
import { ScheduleService } from '../../core/schedule.service';
import { ScoresService } from '../../core/scores.service';
import { TournamentsService } from '../../core/tournaments.service';

interface ScoreDraft {
  home: string;
  away: string;
  homePenalty: string;
  awayPenalty: string;
}

const EMPTY_DRAFT: ScoreDraft = { home: '', away: '', homePenalty: '', awayPenalty: '' };

@Component({
  selector: 'app-scores-page',
  imports: [Button, Select],
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

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly matches = signal<Match[]>([]);
  protected readonly standingRulesByGroup = signal<Map<string, StandingRule>>(new Map());
  protected readonly scoreDrafts = signal<Map<string, ScoreDraft>>(new Map());

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly phaseOptions = computed<SelectOption[]>(() =>
    this.phases().map((phase) => ({ value: phase.id, label: phase.name })),
  );

  protected readonly progress = computed(() => {
    const matches = this.matches();
    const entered = matches.filter((match) => match.score !== null).length;
    return { entered, total: matches.length };
  });

  protected readonly matchesByTimeSlot = computed(() => {
    const groups = new Map<string, { startTime: string; fieldName: string; matches: Match[] }>();
    const unscheduled: Match[] = [];
    for (const match of this.matches()) {
      if (!match.timeSlot) {
        unscheduled.push(match);
        continue;
      }
      const key = match.timeSlot.id;
      const entry = groups.get(key) ?? {
        startTime: match.timeSlot.startTime,
        fieldName: match.timeSlot.field.name,
        matches: [],
      };
      entry.matches.push(match);
      groups.set(key, entry);
    }
    const slots = [...groups.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { slots, unscheduled };
  });

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
    this.matches.set([]);
    try {
      const phases = await this.competitionFormatsService.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);
      if (phases.length > 0) {
        this.selectedPhaseId.set(phases[0].id);
        await this.onPhaseSelected();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les phases.');
    }
  }

  protected async onPhaseChange(phaseId: string): Promise<void> {
    this.selectedPhaseId.set(phaseId);
    await this.onPhaseSelected();
  }

  private async onPhaseSelected(): Promise<void> {
    await Promise.all([this.loadMatches(), this.loadStandingRules()]);
  }

  private async loadMatches(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phaseId = this.selectedPhaseId();
    if (!organizationId || !phaseId) {
      return;
    }
    try {
      this.matches.set(
        await this.scheduleService.listMatches(organizationId, this.tournamentId, phaseId),
      );
    } catch {
      this.errorMessage.set('Impossible de charger les matchs.');
    }
  }

  private async loadStandingRules(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    if (!organizationId || !phase) {
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

  protected isDraw(match: Match): boolean {
    const draft = this.draftFor(match);
    return draft.home !== '' && draft.away !== '' && draft.home === draft.away;
  }

  protected onDraftChange(match: Match, key: keyof ScoreDraft, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.scoreDrafts.update((drafts) => {
      const next = new Map(drafts);
      next.set(match.id, { ...this.draftFor(match), [key]: value });
      return next;
    });
  }

  protected async saveScore(match: Match): Promise<void> {
    const organizationId = this.organization()?.id;
    const draft = this.draftFor(match);
    if (!organizationId || draft.home === '' || draft.away === '') {
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
      const updated = await this.scoresService.validateScore(
        organizationId,
        this.tournamentId,
        match.id,
      );
      this.replaceMatch(updated);
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

  protected async declareForfeit(match: Match, teamId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const updated = await this.scoresService.declareForfeit(
        organizationId,
        this.tournamentId,
        match.id,
        teamId,
      );
      this.replaceMatch(updated);
      this.clearDraft(match.id);
    } catch {
      this.errorMessage.set('Impossible de déclarer ce forfait.');
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
