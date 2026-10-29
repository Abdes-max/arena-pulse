import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'design-system';
import { LanguageService } from 'design-tokens';
import { Match } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { groupRotations, pickCurrentAndNext, Rotation } from '../../core/rotations';
import { OrganizerScoresService } from '../../core/scores.service';
import { TournamentCreationService } from '../../core/tournament-creation.service';

interface DraftScore {
  home: number;
  away: number;
}

const FINISHED = new Set(['COMPLETED', 'FORFEITED', 'CANCELLED']);

/**
 * Mobile port of apps/web's admin live.page.ts ("Jour J"): score entry one
 * rotation at a time, the one being played opened by itself, big +/-
 * steppers, and "Valider la série" recording every field's result in one
 * call. Also carries the ±5 min shift, since this is the screen an
 * organizer has open when the plateau runs late.
 */
@Component({
  selector: 'app-organizer-live-page',
  imports: [Button, IonContent, IonHeader, IonTitle, IonToolbar, TranslocoPipe],
  templateUrl: './live.page.html',
  styleUrl: './live.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerLivePage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly creationApi = inject(TournamentCreationService);
  private readonly scoresApi = inject(OrganizerScoresService);
  private readonly languageService = inject(LanguageService);
  private readonly tournamentId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly apiError = signal<string | null>(null);
  protected readonly matches = signal<Match[]>([]);
  protected readonly drafts = signal<Map<string, DraftScore>>(new Map());
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
      const categories = await this.creationApi.listCategories(organizationId, this.tournamentId);
      const phases = (
        await Promise.all(
          categories.map((category) =>
            this.creationApi.listPhases(organizationId, this.tournamentId, category.id),
          ),
        )
      )
        .flat()
        .filter((phase) => !phase.isSeedPhase);
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
