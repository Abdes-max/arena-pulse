import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'design-system';
import { LanguageService } from 'design-tokens';
import { Match } from 'shared-models';
import { groupRotations, pickCurrentAndNext, Rotation } from '../../../pages/tv/tv-rotations';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import { ScheduleService } from '../../core/schedule.service';
import { ScoresService } from '../../core/scores.service';
import { TournamentsService } from '../../core/tournaments.service';

interface DraftScore {
  home: number;
  away: number;
}

const FINISHED = new Set(['COMPLETED', 'FORFEITED', 'CANCELLED']);

/**
 * "Jour J": the day-of score entry, one rotation ("série") at a time --
 * the one being played is opened and highlighted, every field's match is on
 * one screen with big +/- buttons (made for a phone at the side of the
 * pitch), and "Valider la série" records them all as final results in one
 * call instead of save-then-validate per match on the Scores page.
 */
@Component({
  selector: 'app-live-page',
  imports: [Button, TranslocoPipe],
  templateUrl: './live.page.html',
  styleUrl: './live.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LivePage {
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly scheduleService = inject(ScheduleService);
  private readonly scoresService = inject(ScoresService);
  private readonly languageService = inject(LanguageService);
  private readonly tournamentId =
    inject(ActivatedRoute).snapshot.paramMap.get('tournamentId') ?? '';

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly apiError = signal<string | null>(null);
  protected readonly matches = signal<Match[]>([]);
  protected readonly drafts = signal<Map<string, DraftScore>>(new Map());
  /** Rotation the organizer opened by hand; null = follow the one being played. */
  protected readonly openedStart = signal<string | null>(null);

  protected readonly rotations = computed(() => groupRotations(this.matches()));
  private readonly picked = computed(() => pickCurrentAndNext(this.rotations(), new Date()));
  private readonly focusStart = computed(() => {
    const { current, next } = this.picked();
    return (current ?? next)?.startTime ?? null;
  });
  /** False before the focused rotation has kicked off -- its badge then reads "À suivre". */
  protected readonly focusIsCurrent = computed(() => this.picked().current !== null);
  protected readonly openStart = computed(() => this.openedStart() ?? this.focusStart());

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.authService.organizations()[0]?.id;
    if (!organizationId) {
      return;
    }
    try {
      const categories = await this.tournamentsService.listCategories(
        organizationId,
        this.tournamentId,
      );
      const phases = (
        await Promise.all(
          categories.map((category) =>
            this.competitionFormatsService.listPhases(
              organizationId,
              this.tournamentId,
              category.id,
            ),
          ),
        )
      ).flat();
      const matches = (
        await Promise.all(
          phases.map((phase) =>
            this.scheduleService.listMatches(organizationId, this.tournamentId, phase.id),
          ),
        )
      ).flat();
      this.matches.set(matches);
      this.drafts.set(new Map());
    } catch {
      this.errorMessage.set('admin.live.errors.load');
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

  /** Matches whose teams are both known -- a final waiting on "1er Poule A" can't be scored yet. */
  protected isPlayable(match: Match): boolean {
    return !!match.homeTeam && !!match.awayTeam && match.status !== 'FORFEITED';
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

  protected bump(match: Match, side: keyof DraftScore, delta: number): void {
    const current = this.scoreOf(match);
    const next = { ...current, [side]: Math.max(0, current[side] + delta) };
    this.drafts.update((drafts) => new Map(drafts).set(match.id, next));
  }

  protected async save(rotation: Rotation, validate: boolean): Promise<void> {
    const organizationId = this.authService.organizations()[0]?.id;
    const playable = rotation.matches.filter((match) => this.isPlayable(match));
    if (!organizationId || playable.length === 0) {
      return;
    }
    this.saving.set(true);
    this.apiError.set(null);
    this.errorMessage.set(null);
    try {
      await this.scoresService.upsertScores(
        organizationId,
        this.tournamentId,
        playable.map((match) => {
          const score = this.scoreOf(match);
          return { matchId: match.id, homeScore: score.home, awayScore: score.away };
        }),
        validate,
      );
      if (validate) {
        // Move on to the next rotation by itself.
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
        this.errorMessage.set('admin.live.errors.save');
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** "2-0 · 1-1" -- a finished rotation's results, shown on its collapsed header. */
  protected resultsOf(rotation: Rotation): string {
    return rotation.matches
      .map((match) => (match.score ? `${match.score.homeScore}-${match.score.awayScore}` : '–'))
      .join(' · ');
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
