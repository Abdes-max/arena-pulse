import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'design-system';
import { LanguageService } from 'design-tokens';
import { CompetitionPhase, Match, RoundLabelLang, Venue, matchRoundLabel } from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import { Team, TournamentDetail } from '../../core/models';
import { ScheduleService } from '../../core/schedule.service';
import { TeamsService } from '../../core/teams.service';
import { TournamentsService } from '../../core/tournaments.service';
import { assignPastedNames, isPlaceholderTeamName } from '../../shared/placeholder-teams';
import { summarizeSchedule } from '../../shared/schedule-summary';

interface ScheduleRow {
  startTime: string;
  /** One entry per field column, null when that field is free at this time. */
  cells: (Match | null)[];
}

/**
 * "Vérifier mon programme": the last stop before publishing. Gathers what
 * an organizer otherwise checks across Teams/Structure/Calendar -- team
 * names (with the quick plateau's "Équipe N" placeholders flagged and
 * renamable in place), a read-only rotations x fields grid and the key
 * numbers -- then publishes once they tick "j'ai vérifié".
 */
@Component({
  selector: 'app-tournament-review-page',
  imports: [Button, TranslocoPipe],
  templateUrl: './tournament-review.page.html',
  styleUrl: './tournament-review.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentReviewPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly teamsService = inject(TeamsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly scheduleService = inject(ScheduleService);
  private readonly languageService = inject(LanguageService);

  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId') ?? '';
  private readonly organizationId = computed(() => this.authService.organizations()[0]?.id);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly teams = signal<Team[]>([]);
  protected readonly matches = signal<Match[]>([]);
  protected readonly venues = signal<Venue[]>([]);
  /** Phase each loaded match belongs to, to label it (pool / knockout round). */
  private readonly phaseByMatchId = signal<Map<string, CompetitionPhase>>(new Map());

  /** Edited names keyed by team id -- only what differs from the saved name. */
  protected readonly draftNames = signal<Map<string, string>>(new Map());
  protected readonly pasted = signal('');
  protected readonly savingNames = signal(false);
  protected readonly namesSaved = signal(false);

  protected readonly verified = signal(false);
  protected readonly publishing = signal(false);

  protected readonly summary = computed(() => summarizeSchedule(this.matches()));
  protected readonly fields = computed(() => this.venues().flatMap((venue) => venue.fields));
  protected readonly placeholderCount = computed(
    () => this.teams().filter((team) => isPlaceholderTeamName(this.nameOf(team))).length,
  );
  protected readonly hasDraft = computed(() => this.draftNames().size > 0);
  protected readonly published = computed(() => this.tournament()?.status === 'PUBLISHED');
  protected readonly publicPath = computed(() => {
    const slug = this.tournament()?.slug;
    return slug ? `/${slug}` : null;
  });

  protected readonly rows = computed<ScheduleRow[]>(() => {
    const fieldIds = this.fields().map((field) => field.id);
    const byStart = new Map<string, (Match | null)[]>();
    for (const match of this.matches()) {
      const slot = match.timeSlot;
      if (!slot) {
        continue;
      }
      const key = new Date(slot.startTime).toISOString();
      const cells = byStart.get(key) ?? fieldIds.map(() => null);
      const column = fieldIds.indexOf(slot.field.id);
      if (column >= 0) {
        cells[column] = match;
      }
      byStart.set(key, cells);
    }
    return [...byStart.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([startTime, cells]) => ({ startTime, cells }));
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId) {
      return;
    }
    this.loading.set(true);
    try {
      const [tournament, teams, categories, venues] = await Promise.all([
        this.tournamentsService.getTournament(organizationId, this.tournamentId),
        this.teamsService.listTeams(organizationId, this.tournamentId),
        this.tournamentsService.listCategories(organizationId, this.tournamentId),
        this.tournamentsService.listVenues(organizationId, this.tournamentId),
      ]);
      this.tournament.set(tournament);
      this.teams.set(teams);
      this.venues.set(venues);
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
      const matches = await Promise.all(
        phases.map((phase) =>
          this.scheduleService.listMatches(organizationId, this.tournamentId, phase.id),
        ),
      );
      const phaseByMatchId = new Map<string, CompetitionPhase>();
      matches.forEach((list, index) => {
        for (const match of list) {
          phaseByMatchId.set(match.id, phases[index]);
        }
      });
      this.phaseByMatchId.set(phaseByMatchId);
      this.matches.set(matches.flat());
    } catch {
      this.errorMessage.set('admin.review.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  /** "Poule A", "Demi-finale", "Finale"... -- shown on each match of the grid. */
  protected phaseLabel(match: Match): string {
    const phase = this.phaseByMatchId().get(match.id);
    if (phase?.type === 'GROUP_STAGE' && match.groupId) {
      const groupName = this.teams().find((team) => team.groupId === match.groupId)?.groupName;
      if (groupName) {
        return groupName;
      }
    }
    return phase
      ? matchRoundLabel(phase, match, 'full', this.languageService.language() as RoundLabelLang)
      : '';
  }

  /** Venue line for the stats: names (and address of the first one). */
  protected readonly venueLabel = computed(() => {
    const venues = this.venues();
    if (venues.length === 0) {
      return null;
    }
    const first = venues[0];
    return {
      name: venues.map((venue) => venue.name).join(', '),
      address: first.address && first.address !== first.name ? first.address : null,
    };
  });

  protected nameOf(team: Team): string {
    return this.draftNames().get(team.id) ?? team.name;
  }

  protected isPlaceholder(team: Team): boolean {
    return isPlaceholderTeamName(this.nameOf(team));
  }

  protected onNameInput(team: Team, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.namesSaved.set(false);
    this.draftNames.update((drafts) => {
      const next = new Map(drafts);
      if (value.trim() === team.name || value.trim() === '') {
        next.delete(team.id);
      } else {
        next.set(team.id, value);
      }
      return next;
    });
  }

  protected onPasteInput(event: Event): void {
    this.pasted.set((event.target as HTMLTextAreaElement).value);
  }

  protected applyPasted(): void {
    const renames = assignPastedNames(
      this.teams().map((team) => ({ id: team.id, name: this.nameOf(team) })),
      this.pasted(),
    );
    this.namesSaved.set(false);
    this.draftNames.update((drafts) => new Map([...drafts, ...renames]));
    this.pasted.set('');
  }

  protected async saveNames(): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId || !this.hasDraft()) {
      return;
    }
    this.savingNames.set(true);
    this.errorMessage.set(null);
    try {
      const updated = await Promise.all(
        [...this.draftNames()].map(([teamId, name]) =>
          this.teamsService.updateTeam(organizationId, this.tournamentId, teamId, {
            name: name.trim(),
          }),
        ),
      );
      const byId = new Map(updated.map((team) => [team.id, team]));
      this.teams.update((teams) => teams.map((team) => byId.get(team.id) ?? team));
      this.draftNames.set(new Map());
      this.namesSaved.set(true);
      // Matches embed team names -- reload so the grid shows the new ones.
      await this.load();
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'admin.review.errors.duplicateName'
          : 'admin.review.errors.saveNames',
      );
    } finally {
      this.savingNames.set(false);
    }
  }

  protected toggleVerified(event: Event): void {
    this.verified.set((event.target as HTMLInputElement).checked);
  }

  protected async publish(): Promise<void> {
    const organizationId = this.organizationId();
    if (!organizationId || !this.verified() || this.hasDraft()) {
      return;
    }
    this.publishing.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.tournamentsService.publish(organizationId, this.tournamentId);
      if (result.status === 'PENDING_PAYMENT') {
        window.location.href = result.checkoutUrl;
        return;
      }
      this.tournament.set(result);
    } catch (error) {
      this.errorMessage.set(this.publishErrorKey(error));
    } finally {
      this.publishing.set(false);
    }
  }

  // Same codes as tournament-form.page.ts's publishErrorKey.
  private publishErrorKey(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      switch ((error.error as { code?: unknown } | null)?.code) {
        case 'PUBLISH_NO_CATEGORY':
          return 'admin.tournamentForm.errors.publishNoCategory';
        case 'PUBLISH_NO_STRUCTURE':
          return 'admin.tournamentForm.errors.publishNoStructure';
        case 'PUBLISH_NO_CALENDAR':
          return 'admin.tournamentForm.errors.publishNoCalendar';
        default:
          return 'admin.tournamentForm.errors.actionNotAllowed';
      }
    }
    return 'admin.tournamentForm.errors.generic';
  }

  protected formatClock(time: string | null): string {
    return time
      ? new Date(time).toLocaleTimeString(this.languageService.language(), {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '–';
  }

  protected teamLabel(team: Match['homeTeam'], sourceLabel: string | null): string {
    return team?.name ?? sourceLabel ?? '?';
  }
}
