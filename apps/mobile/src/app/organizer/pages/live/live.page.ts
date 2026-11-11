import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, SetDraft, SetsInput } from 'design-system';
import { LanguageService } from 'design-tokens';
import { CompetitionPhase, Match } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { groupRotations, pickCurrentAndNext, Rotation } from '../../core/rotations';
import { OrganizerTournament } from '../../core/models';
import { OrganizerScoresService } from '../../core/scores.service';
import { OrganizerTournamentsService } from '../../core/tournaments.service';
import { TournamentCreationService } from '../../core/tournament-creation.service';

interface DraftScore {
  home: number;
  away: number;
}

const FINISHED = new Set(['COMPLETED', 'FORFEITED', 'CANCELLED']);

interface PoolErrorBody {
  message?: string;
  code?: string;
}

/**
 * Mobile port of apps/web's admin live.page.ts ("Jour J"): score entry one
 * rotation at a time, the one being played opened by itself, big +/-
 * steppers, and "Valider la série" recording every field's result in one
 * call. Also carries the ±5 min shift, since this is the screen an
 * organizer has open when the plateau runs late.
 */
@Component({
  selector: 'app-organizer-live-page',
  imports: [Button, IonContent, IonHeader, IonTitle, IonToolbar, SetsInput, TranslocoPipe],
  templateUrl: './live.page.html',
  styleUrl: './live.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerLivePage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly creationApi = inject(TournamentCreationService);
  private readonly scoresApi = inject(OrganizerScoresService);
  private readonly tournamentsApi = inject(OrganizerTournamentsService);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);
  private readonly tournamentId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly apiError = signal<string | null>(null);
  protected readonly matches = signal<Match[]>([]);
  protected readonly drafts = signal<Map<string, DraftScore>>(new Map());

  // Sets sports (padel, tennis, volleyball, badminton): each match is a list
  // of sets instead of a +/- counter; the API recomputes the sets won.
  private readonly tournament = signal<OrganizerTournament | null>(null);
  private readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly isSetsFormat = computed(() => this.tournament()?.scoreFormat === 'SETS');
  protected readonly setsDrafts = signal<Map<string, SetDraft[]>>(new Map());
  protected readonly setsLabels = computed(() => {
    const lang = this.languageService.language();
    const t = (key: string) => this.transloco.translate(`organizer.scores.sets.${key}`, {}, lang);
    return {
      set: t('set'),
      home: t('home'),
      away: t('away'),
      add: t('add'),
      remove: t('remove'),
    };
  });
  /** Rotation opened by hand; null = follow the one being played, '' = all closed. */
  protected readonly openedStart = signal<string | null>(null);
  private groupPhaseIds: string[] = [];

  protected readonly rotations = computed(() => groupRotations(this.matches()));
  private readonly picked = computed(() => pickCurrentAndNext(this.rotations(), new Date()));
  private readonly focusStart = computed(() => {
    const { current, next } = this.picked();
    return (current ?? next)?.startTime ?? null;
  });
  protected readonly focusIsCurrent = computed(() => this.picked().current !== null);
  protected readonly openStart = computed(() => this.openedStart() ?? this.focusStart());

  constructor() {
    void this.load();
  }

  protected async goBack(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }

  private async load(): Promise<void> {
    const organizationId = this.auth.organizations()[0]?.id;
    if (!organizationId) {
      return;
    }
    try {
      const [tournament, categories] = await Promise.all([
        this.tournamentsApi.getTournament(organizationId, this.tournamentId),
        this.creationApi.listCategories(organizationId, this.tournamentId),
      ]);
      this.tournament.set(tournament);
      const phases = (
        await Promise.all(
          categories.map((category) =>
            this.creationApi.listPhases(organizationId, this.tournamentId, category.id),
          ),
        )
      )
        .flat()
        .filter((phase) => !phase.isSeedPhase);
      this.phases.set(phases);
      this.groupPhaseIds = phases
        .filter((phase) => phase.type === 'GROUP_STAGE')
        .map((phase) => phase.id);
      const matches = (
        await Promise.all(
          phases.map((phase) =>
            this.scoresApi.listMatches(organizationId, this.tournamentId, phase.id),
          ),
        )
      ).flat();
      this.matches.set(matches);
      this.drafts.set(new Map());
      this.setsDrafts.set(new Map());
    } catch {
      this.errorMessage.set('organizer.live.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  protected isFocus(rotation: Rotation): boolean {
    return rotation.startTime === this.focusStart();
  }

  protected isDone(rotation: Rotation): boolean {
    return rotation.matches.every((match) => FINISHED.has(match.status));
  }

  /** Both teams known -- a final waiting on "1er Poule A" can't be scored yet. */
  protected isPlayable(match: Match): boolean {
    return (
      !!match.homeTeam && !!match.awayTeam && match.status !== 'FORFEITED' && !this.isLocked(match)
    );
  }

  /** A pool match whose phase has its scores validated is read-only until the phase is reopened. */
  protected isLocked(match: Match): boolean {
    return (
      !!match.groupId &&
      this.phases().some(
        (phase) =>
          !!phase.scoresValidatedAt && phase.groups.some((group) => group.id === match.groupId),
      )
    );
  }

  /** One "validate the pool scores" block per pool phase that feeds a knockout phase. */
  protected readonly poolBlocks = computed(() =>
    this.phases()
      .filter((phase) => phase.type === 'GROUP_STAGE' && phase.feedsKnockout && !phase.isSeedPhase)
      .map((phase) => {
        const groupIds = new Set(phase.groups.map((group) => group.id));
        const poolMatches = this.matches().filter(
          (match) => match.groupId && groupIds.has(match.groupId),
        );
        return {
          phaseId: phase.id,
          name: phase.name,
          validated: !!phase.scoresValidatedAt,
          finished: poolMatches.filter(
            (match) => match.status === 'COMPLETED' || match.status === 'FORFEITED',
          ).length,
          total: poolMatches.length,
        };
      })
      .filter((block) => block.total > 0),
  );

  protected async validatePool(phaseId: string): Promise<void> {
    const organizationId = this.auth.organizations()[0]?.id;
    if (!organizationId) {
      return;
    }
    this.apiError.set(null);
    this.errorMessage.set(null);
    try {
      await this.scoresApi.validatePoolScores(organizationId, this.tournamentId, phaseId);
      await this.load();
    } catch (error) {
      this.showPoolError(error, 'organizer.scores.pools.validateError');
    }
  }

  protected async reopenPool(phaseId: string): Promise<void> {
    const organizationId = this.auth.organizations()[0]?.id;
    if (!organizationId) {
      return;
    }
    this.apiError.set(null);
    this.errorMessage.set(null);
    try {
      try {
        await this.scoresApi.reopenPoolScores(organizationId, this.tournamentId, phaseId, false);
      } catch (error) {
        // Scores already entered in the final phases would no longer match
        // the right teams: ask before wiping them.
        const body = error instanceof HttpErrorResponse ? (error.error as PoolErrorBody) : null;
        if (error instanceof HttpErrorResponse && body?.code === 'KNOCKOUT_PROGRESS_EXISTS') {
          if (!window.confirm(body.message ?? '')) {
            return;
          }
          await this.scoresApi.reopenPoolScores(organizationId, this.tournamentId, phaseId, true);
        } else {
          throw error;
        }
      }
      await this.load();
    } catch (error) {
      this.showPoolError(error, 'organizer.scores.pools.reopenError');
    }
  }

  private showPoolError(error: unknown, fallback: string): void {
    const message =
      error instanceof HttpErrorResponse && error.status === 409
        ? (error.error as PoolErrorBody).message
        : null;
    if (message) {
      this.apiError.set(message);
    } else {
      this.errorMessage.set(fallback);
    }
  }

  protected toggle(rotation: Rotation): void {
    this.openedStart.set(this.openStart() === rotation.startTime ? '' : rotation.startTime);
  }

  protected scoreOf(match: Match): DraftScore {
    return (
      this.drafts().get(match.id) ?? {
        home: match.score?.homeScore ?? 0,
        away: match.score?.awayScore ?? 0,
      }
    );
  }

  protected setsToWinFor(match: Match): number {
    const phase = this.phases().find((candidate) =>
      match.knockoutBracketId
        ? candidate.knockoutBracket?.id === match.knockoutBracketId
        : candidate.groups.some((group) => group.id === match.groupId),
    );
    return phase?.setsToWin ?? this.tournament()?.defaultSetsToWin ?? 2;
  }

  protected setsDraftFor(match: Match): SetDraft[] {
    const draft = this.setsDrafts().get(match.id);
    if (draft) {
      return draft;
    }
    return (match.score?.sets ?? []).map((set) => ({
      home: String(set.home),
      away: String(set.away),
    }));
  }

  protected onSetsChange(match: Match, sets: SetDraft[]): void {
    this.setsDrafts.update((drafts) => new Map(drafts).set(match.id, sets));
  }

  /** Complete rows only: a half-typed set is left out rather than sent. */
  private setsPayload(match: Match): { home: number; away: number }[] {
    return this.setsDraftFor(match)
      .filter((set) => set.home !== '' && set.away !== '')
      .map((set) => ({ home: Number(set.home), away: Number(set.away) }));
  }

  protected bump(match: Match, side: keyof DraftScore, delta: number): void {
    const current = this.scoreOf(match);
    const next = { ...current, [side]: Math.max(0, current[side] + delta) };
    this.drafts.update((drafts) => new Map(drafts).set(match.id, next));
  }

  protected resultsOf(rotation: Rotation): string {
    return rotation.matches
      .map((match) => (match.score ? `${match.score.homeScore}-${match.score.awayScore}` : '–'))
      .join(' · ');
  }

  protected async save(rotation: Rotation, validate: boolean): Promise<void> {
    const organizationId = this.auth.organizations()[0]?.id;
    const playable = rotation.matches.filter((match) => this.isPlayable(match));
    if (!organizationId || playable.length === 0) {
      return;
    }
    this.saving.set(true);
    this.apiError.set(null);
    this.errorMessage.set(null);
    try {
      await this.scoresApi.upsertScores(
        organizationId,
        this.tournamentId,
        playable.map((match) => {
          if (this.isSetsFormat()) {
            const sets = this.setsPayload(match);
            return {
              matchId: match.id,
              homeScore: sets.filter((set) => set.home > set.away).length,
              awayScore: sets.filter((set) => set.away > set.home).length,
              sets,
            };
          }
          const score = this.scoreOf(match);
          return { matchId: match.id, homeScore: score.home, awayScore: score.away };
        }),
        validate,
      );
      if (validate) {
        this.openedStart.set(null);
      }
      await this.load();
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse
          ? (error.error as { message?: unknown } | null)?.message
          : null;
      if (typeof message === 'string') {
        this.apiError.set(message);
      } else {
        this.errorMessage.set('organizer.live.errors.save');
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** "On a 5 minutes de retard": moves every not-yet-played pool match. */
  protected async shift(minutes: number): Promise<void> {
    const organizationId = this.auth.organizations()[0]?.id;
    if (!organizationId || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      for (const phaseId of this.groupPhaseIds) {
        await this.creationApi.shiftSchedule(organizationId, this.tournamentId, phaseId, minutes);
      }
      await this.load();
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'organizer.live.errors.shiftConflict'
          : 'organizer.live.errors.shift',
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected formatClock(time: string): string {
    return new Date(time).toLocaleTimeString(this.languageService.language(), {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected teamName(team: Match['homeTeam'], sourceLabel: string | null): string {
    return team?.name ?? sourceLabel ?? '?';
  }
}
