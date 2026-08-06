import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import {
  Category,
  CompetitionPhase,
  Match,
  MatchOfficial,
  Referee,
  Team,
  TimeSlot,
  Venue,
} from '../../core/models';
import { RefereesService } from '../../core/referees.service';
import { ScheduleService } from '../../core/schedule.service';
import { TeamsService } from '../../core/teams.service';
import { TimeSlotsService } from '../../core/timeslots.service';
import { TournamentsService } from '../../core/tournaments.service';
import { matchRoundLabel } from 'shared-models';

interface TimeSlotDraft {
  start: string;
  end: string;
  label: string;
}

const EMPTY_DRAFT: TimeSlotDraft = { start: '', end: '', label: '' };

@Component({
  selector: 'app-schedule-page',
  imports: [Button, Select, TextField, NgTemplateOutlet],
  templateUrl: './schedule.page.html',
  styleUrl: './schedule.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SchedulePage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly scheduleService = inject(ScheduleService);
  private readonly timeSlotsService = inject(TimeSlotsService);
  private readonly refereesService = inject(RefereesService);
  private readonly teamsService = inject(TeamsService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly generating = signal(false);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedPhaseId = signal('');
  protected readonly venues = signal<Venue[]>([]);
  protected readonly matches = signal<Match[]>([]);
  protected readonly referees = signal<Referee[]>([]);
  protected readonly teams = signal<Team[]>([]);
  protected readonly teamsCanReferee = signal(false);
  protected readonly timeSlotsByField = signal<Map<string, TimeSlot[]>>(new Map());
  protected readonly newSlotDrafts = signal<Map<string, TimeSlotDraft>>(new Map());
  protected readonly draggedMatchId = signal<string | null>(null);

  protected readonly selectedFieldIds = signal<string[]>([]);
  protected readonly startDateTime = signal('');
  protected readonly matchDurationMinutes = signal('');
  protected readonly breakDurationMinutes = signal('');
  protected readonly refereesPerMatch = signal('');

  protected readonly selectedPhase = computed(
    () => this.phases().find((phase) => phase.id === this.selectedPhaseId()) ?? null,
  );

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly phaseOptions = computed<SelectOption[]>(() =>
    this.phases().map((phase) => ({
      value: phase.id,
      label: `${phase.name} (${phase.type === 'GROUP_STAGE' ? 'Poules' : 'Élimination directe'})`,
    })),
  );

  protected readonly fields = computed(() =>
    this.venues().flatMap((venue) =>
      venue.fields.map((field) => ({ ...field, venueName: venue.name })),
    ),
  );

  // Explicit left/right controls above the grid, not just the browser's own
  // scrollbar -- with many terrains, the horizontal overflow isn't always
  // obvious at a glance.
  private readonly gridScroller = viewChild<ElementRef<HTMLDivElement>>('gridScroller');

  protected scrollGrid(direction: 'left' | 'right'): void {
    const element = this.gridScroller()?.nativeElement;
    if (!element) {
      return;
    }
    const amount = element.clientWidth * 0.8 * (direction === 'left' ? -1 : 1);
    element.scrollBy({ left: amount, behavior: 'smooth' });
  }

  protected readonly matchBySlotId = computed(() => {
    const map = new Map<string, Match>();
    for (const match of this.matches()) {
      if (match.timeSlot) {
        map.set(match.timeSlot.id, match);
      }
    }
    return map;
  });

  protected readonly unscheduledMatches = computed(() =>
    this.matches().filter((match) => !match.timeSlot),
  );

  // Grouped by round ("tour") -- a flat list mixing every round together
  // reads as noise once a phase has more than a handful of matches; phase
  // itself is already the page's own selector above, so round is the one
  // grouping level left to add here.
  protected readonly unscheduledMatchesByRound = computed(() => {
    const groups = new Map<number, Match[]>();
    for (const match of this.unscheduledMatches()) {
      const list = groups.get(match.round) ?? [];
      list.push(match);
      groups.set(match.round, list);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, roundMatches]) => ({ round, matches: roundMatches }));
  });

  // No referee ever assigned to the tournament -- showing an always-empty
  // "+ Arbitre…" picker on every match is just noise, and there's nothing
  // meaningful "Arbitres par match" could generate either.
  protected readonly hasReferees = computed(() => this.referees().length > 0);

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
      const [categories, venues, tournament, referees] = await Promise.all([
        this.tournamentsService.listCategories(organizationId, this.tournamentId),
        this.tournamentsService.listVenues(organizationId, this.tournamentId),
        this.tournamentsService.getTournament(organizationId, this.tournamentId),
        this.refereesService.listReferees(organizationId, this.tournamentId),
      ]);
      this.categories.set(categories);
      this.venues.set(venues);
      this.teamsCanReferee.set(tournament.teamsCanReferee);
      this.referees.set(referees);
      await this.loadTimeSlots();
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadTeams();
        await this.loadPhases();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les catégories.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTimeSlots(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    const entries = await Promise.all(
      this.fields().map(
        async (field) =>
          [
            field.id,
            await this.timeSlotsService.listTimeSlots(organizationId, this.tournamentId, field.id),
          ] as const,
      ),
    );
    this.timeSlotsByField.set(new Map(entries));
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadTeams();
    await this.loadPhases();
  }

  private async loadTeams(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    try {
      this.teams.set(
        await this.teamsService.listTeams(organizationId, this.tournamentId, categoryId),
      );
    } catch {
      this.errorMessage.set('Impossible de charger les équipes.');
    }
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
      const defaultPhase = phases.find((phase) => phase.type === 'GROUP_STAGE') ?? phases[0];
      if (defaultPhase) {
        this.selectedPhaseId.set(defaultPhase.id);
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
    const phase = this.phases().find((p) => p.id === this.selectedPhaseId());
    if (phase) {
      this.matchDurationMinutes.set(String(phase.matchDurationMinutes));
      this.breakDurationMinutes.set(String(phase.breakDurationMinutes));
      this.refereesPerMatch.set(this.hasReferees() ? String(phase.refereesPerMatch) : '0');
    }
    await this.loadMatches();
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
      this.errorMessage.set('Impossible de charger le calendrier.');
    }
  }

  protected onFieldToggle(fieldId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedFieldIds.update((ids) =>
      checked ? [...ids, fieldId] : ids.filter((id) => id !== fieldId),
    );
  }

  protected onStartDateTimeChange(value: string): void {
    this.startDateTime.set(value);
  }

  protected onMatchDurationChange(value: string): void {
    this.matchDurationMinutes.set(value);
  }

  protected onBreakDurationChange(value: string): void {
    this.breakDurationMinutes.set(value);
  }

  protected onRefereesPerMatchChange(value: string): void {
    this.refereesPerMatch.set(value);
  }

  protected async generateSchedule(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phaseId = this.selectedPhaseId();
    const fieldIds = this.selectedFieldIds();
    const startDateTime = this.startDateTime();
    if (!organizationId || !phaseId) {
      return;
    }
    if (fieldIds.length === 0) {
      this.errorMessage.set('Sélectionnez au moins un terrain avant de générer le calendrier.');
      return;
    }
    if (!startDateTime) {
      this.errorMessage.set('Renseignez une date de début avant de générer le calendrier.');
      return;
    }
    this.errorMessage.set(null);
    this.generating.set(true);
    try {
      const generated = await this.scheduleService.generateSchedule(
        organizationId,
        this.tournamentId,
        phaseId,
        {
          fieldIds,
          startDateTime: new Date(startDateTime).toISOString(),
          matchDurationMinutes: this.matchDurationMinutes()
            ? Number(this.matchDurationMinutes())
            : undefined,
          breakDurationMinutes: this.breakDurationMinutes()
            ? Number(this.breakDurationMinutes())
            : undefined,
          refereesPerMatch: this.refereesPerMatch() ? Number(this.refereesPerMatch()) : undefined,
        },
      );
      this.matches.set(generated);
      // Round-robin fixtures need at least 2 teams per group -- a silent
      // empty result here almost always means every group in this phase is
      // still empty or has a single team (e.g. teams created but never
      // assigned to a group on the Structure page).
      if (generated.length === 0) {
        this.errorMessage.set(
          "Aucun match n'a pu être généré : assignez au moins deux équipes à chaque poule de cette phase sur la page Structure, puis réessayez.",
        );
      }
      await this.loadTimeSlots();
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Des matchs existent déjà pour cette phase. Videz le calendrier avant d’en générer un nouveau.'
          : 'Impossible de générer le calendrier.',
      );
    } finally {
      this.generating.set(false);
    }
  }

  /** Reserves a slot on these fields for every round of the bracket (round 1 immediately gets real opponents; later rounds claim their reservation automatically once known, as their own scores validate). */
  protected async generateKnockoutMatches(): Promise<void> {
    const organizationId = this.organization()?.id;
    const bracketId = this.selectedPhase()?.knockoutBracket?.id;
    const fieldIds = this.selectedFieldIds();
    const startDateTime = this.startDateTime();
    if (!organizationId || !bracketId) {
      return;
    }
    if (fieldIds.length === 0) {
      this.errorMessage.set('Sélectionnez au moins un terrain avant de générer le tableau.');
      return;
    }
    if (!startDateTime) {
      this.errorMessage.set('Renseignez une date de début avant de générer le tableau.');
      return;
    }
    this.errorMessage.set(null);
    this.generating.set(true);
    try {
      const generated = await this.competitionFormatsService.generateBracketMatches(
        organizationId,
        this.tournamentId,
        bracketId,
        {
          fieldIds,
          startDateTime: new Date(startDateTime).toISOString(),
          matchDurationMinutes: this.matchDurationMinutes()
            ? Number(this.matchDurationMinutes())
            : undefined,
          breakDurationMinutes: this.breakDurationMinutes()
            ? Number(this.breakDurationMinutes())
            : undefined,
        },
      );
      this.matches.set(generated);
      await this.loadTimeSlots();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errorMessage.set(
          'Les matchs de ce tableau ont déjà été générés. Videz le calendrier avant d’en générer de nouveaux.',
        );
      } else if (error instanceof HttpErrorResponse && error.status === 400) {
        this.errorMessage.set(
          (error.error as { message?: string })?.message ??
            'Impossible de générer les matchs du tableau.',
        );
      } else {
        this.errorMessage.set('Impossible de générer les matchs du tableau.');
      }
    } finally {
      this.generating.set(false);
    }
  }

  protected async resetSchedule(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phaseId = this.selectedPhaseId();
    if (!organizationId || !phaseId) {
      return;
    }
    try {
      await this.scheduleService.resetSchedule(organizationId, this.tournamentId, phaseId);
      this.matches.set([]);
      await this.loadTimeSlots();
    } catch {
      this.errorMessage.set('Impossible de vider le calendrier.');
    }
  }

  protected formatSlotTime(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  protected slotTimeLabel(slot: TimeSlot): string {
    return slot.label
      ? `${this.formatSlotTime(slot.startTime)} — ${slot.label}`
      : this.formatSlotTime(slot.startTime);
  }

  // "1/8"/"1/4"/"1/2"/"Finale" for knockout phases, "Tour N" for group
  // stages -- compact on purpose, this sits in a card header alongside the
  // phase name and the time.
  protected roundDisplay(match: Match): string {
    const phase = this.selectedPhase();
    return phase ? matchRoundLabel(phase, match, 'compact') : `Tour ${match.round}`;
  }

  protected officialLabel(official: MatchOfficial): string {
    if (official.referee) {
      return `${official.referee.firstName} ${official.referee.lastName}`;
    }
    return official.refereeingTeam?.name ?? '';
  }

  protected availableReferees(match: Match): Referee[] {
    const assignedIds = new Set(
      match.officials.map((official) => official.referee?.id).filter((id) => id !== undefined),
    );
    return this.referees().filter((referee) => !assignedIds.has(referee.id));
  }

  protected refereeOptions(match: Match): SelectOption[] {
    return [
      { value: '', label: '+ Arbitre…' },
      ...this.availableReferees(match).map((referee) => ({
        value: referee.id,
        label: `${referee.firstName} ${referee.lastName}`,
      })),
    ];
  }

  protected availableRefereeingTeams(match: Match): Team[] {
    const assignedIds = new Set(
      match.officials
        .map((official) => official.refereeingTeam?.id)
        .filter((id) => id !== undefined),
    );
    const excludedIds = new Set([match.homeTeam?.id, match.awayTeam?.id]);
    return this.teams().filter((team) => !assignedIds.has(team.id) && !excludedIds.has(team.id));
  }

  protected refereeingTeamOptions(match: Match): SelectOption[] {
    return [
      { value: '', label: '+ Équipe arbitre…' },
      ...this.availableRefereeingTeams(match).map((team) => ({ value: team.id, label: team.name })),
    ];
  }

  protected onMatchDragStart(matchId: string, event: DragEvent): void {
    this.draggedMatchId.set(matchId);
    event.dataTransfer?.setData('text/plain', matchId);
  }

  protected onSlotDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected async onSlotDrop(timeSlotId: string, event: DragEvent): Promise<void> {
    event.preventDefault();
    const matchId = this.draggedMatchId();
    this.draggedMatchId.set(null);
    if (!matchId || this.matchBySlotId().has(timeSlotId)) {
      return;
    }
    await this.moveMatchToSlot(matchId, timeSlotId);
  }

  protected async onUnscheduledDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const matchId = this.draggedMatchId();
    this.draggedMatchId.set(null);
    if (!matchId) {
      return;
    }
    await this.moveMatchToSlot(matchId, null);
  }

  private async moveMatchToSlot(matchId: string, timeSlotId: string | null): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const updated = await this.scheduleService.moveMatch(
        organizationId,
        this.tournamentId,
        matchId,
        timeSlotId,
      );
      this.matches.update((matches) =>
        matches.map((match) => (match.id === matchId ? updated : match)),
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Ce créneau est indisponible : il est occupé ou une équipe/un officiel est déjà engagé à cette heure.'
          : 'Impossible de déplacer ce match, réessayez.',
      );
    }
  }

  protected onAddReferee(matchId: string, refereeId: string): void {
    if (refereeId) {
      void this.addOfficial(matchId, { refereeId });
    }
  }

  protected onAddRefereeingTeam(matchId: string, refereeingTeamId: string): void {
    if (refereeingTeamId) {
      void this.addOfficial(matchId, { refereeingTeamId });
    }
  }

  private async addOfficial(
    matchId: string,
    payload: { refereeId?: string; refereeingTeamId?: string },
  ): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const updated = await this.scheduleService.addOfficial(
        organizationId,
        this.tournamentId,
        matchId,
        payload,
      );
      this.matches.update((matches) =>
        matches.map((match) => (match.id === matchId ? updated : match)),
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Cet officiel est déjà engagé sur un autre match à ce créneau.'
          : "Impossible d'ajouter cet officiel, réessayez.",
      );
    }
  }

  protected async onRemoveOfficial(officialId: string, matchId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      await this.scheduleService.removeOfficial(organizationId, this.tournamentId, officialId);
      this.matches.update((matches) =>
        matches.map((match) =>
          match.id === matchId
            ? {
                ...match,
                officials: match.officials.filter((official) => official.id !== officialId),
              }
            : match,
        ),
      );
    } catch {
      this.errorMessage.set('Impossible de retirer cet officiel, réessayez.');
    }
  }

  protected draftFor(fieldId: string): TimeSlotDraft {
    return this.newSlotDrafts().get(fieldId) ?? EMPTY_DRAFT;
  }

  protected onSlotDraftChange(fieldId: string, key: keyof TimeSlotDraft, value: string): void {
    this.newSlotDrafts.update((drafts) => {
      const next = new Map(drafts);
      next.set(fieldId, { ...this.draftFor(fieldId), [key]: value });
      return next;
    });
  }

  protected async addTimeSlot(fieldId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    const draft = this.draftFor(fieldId);
    if (!organizationId || !draft.start || !draft.end) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const slot = await this.timeSlotsService.createTimeSlot(
        organizationId,
        this.tournamentId,
        fieldId,
        {
          startTime: new Date(draft.start).toISOString(),
          endTime: new Date(draft.end).toISOString(),
          label: draft.label || undefined,
        },
      );
      this.timeSlotsByField.update((map) => {
        const next = new Map(map);
        next.set(
          fieldId,
          [...(next.get(fieldId) ?? []), slot].sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          ),
        );
        return next;
      });
      this.newSlotDrafts.update((drafts) => {
        const next = new Map(drafts);
        next.set(fieldId, EMPTY_DRAFT);
        return next;
      });
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'Ce créneau chevauche un créneau existant sur ce terrain.'
          : 'Impossible de créer ce créneau, réessayez.',
      );
    }
  }

  protected async deleteTimeSlot(fieldId: string, timeSlotId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      await this.timeSlotsService.deleteTimeSlot(organizationId, this.tournamentId, timeSlotId);
      this.timeSlotsByField.update((map) => {
        const next = new Map(map);
        next.set(
          fieldId,
          (next.get(fieldId) ?? []).filter((slot) => slot.id !== timeSlotId),
        );
        return next;
      });
    } catch {
      this.errorMessage.set('Impossible de supprimer ce créneau, réessayez.');
    }
  }
}
