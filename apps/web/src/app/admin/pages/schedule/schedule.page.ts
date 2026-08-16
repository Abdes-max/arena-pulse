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
import { AssetUrlService } from 'api-client';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import {
  Category,
  CompetitionPhase,
  CompetitionPhaseType,
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
import { FieldSelector } from '../../shared/field-selector';
import { matchRoundLabel } from 'shared-models';

interface TimeSlotDraft {
  start: string;
  end: string;
  label: string;
}

const EMPTY_DRAFT: TimeSlotDraft = { start: '', end: '', label: '' };

@Component({
  selector: 'app-schedule-page',
  imports: [Button, Select, TextField, NgTemplateOutlet, FieldSelector],
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
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly generating = signal(false);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  // Poules, Élimination directe, or Tous (both together, view-only -- the
  // generation form always targets one specific type, never "Tous"). Never
  // an individual named phase -- with several knockout tiers (see
  // qualification multi-compétitions), they must all be generated together,
  // so there's nothing to gain from picking one tier at a time here the way
  // the manual Structure page still does.
  protected readonly selectedPhaseType = signal<CompetitionPhaseType | 'ALL'>('GROUP_STAGE');
  protected readonly venues = signal<Venue[]>([]);
  protected readonly matches = signal<Match[]>([]);
  protected readonly referees = signal<Referee[]>([]);
  protected readonly teams = signal<Team[]>([]);
  protected readonly teamsCanReferee = signal(false);
  protected readonly timeSlotsByField = signal<Map<string, TimeSlot[]>>(new Map());
  protected readonly newSlotDrafts = signal<Map<string, TimeSlotDraft>>(new Map());
  protected readonly draggedMatchId = signal<string | null>(null);
  // Tap-to-move: touchscreens don't fire the native HTML5 drag events this
  // grid otherwise relies on (draggable/dragstart/dragover/drop -- neither
  // iOS Safari nor Chrome/Android translate touch gestures into them for an
  // arbitrary element). This is a second, independent way to do the same
  // move -- tap a match to select it, then tap an empty slot to place it
  // there (or tap the same match again to cancel) -- purely additive, the
  // existing mouse drag-and-drop above is untouched.
  protected readonly selectedMatchId = signal<string | null>(null);

  protected readonly selectedFieldIds = signal<string[]>([]);
  protected readonly startDateTime = signal('');
  // Knockout stage only -- its start isn't entered by hand, it's the pool
  // phase's last scheduled match plus this pause (see generateAllBracketMatches).
  protected readonly breakAfterPoolsMinutes = signal('');
  protected readonly matchDurationMinutes = signal('');
  protected readonly breakDurationMinutes = signal('');
  protected readonly refereesPerMatch = signal('');

  // Excludes the fictitious pool phase a KNOCKOUT_ONLY structure preset
  // creates to seed its bracket from (isSeedPhase) -- it never has matches,
  // so treating it as a real pool phase here would offer a useless "Poules"
  // tab and force entering a "temps de pause après les poules" that makes no
  // sense when there are no pools to pause after. See generateAllKnockoutMatches.
  protected readonly groupStagePhase = computed(
    () => this.phases().find((phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase) ?? null,
  );
  protected readonly knockoutPhases = computed(() =>
    this.phases()
      .filter((phase) => phase.type === 'KNOCKOUT')
      .sort((a, b) => a.position - b.position),
  );

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
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
      options.push({ value: 'KNOCKOUT', label: 'Élimination directe' });
    }
    return options;
  });

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
    this.matches.set([]);
    try {
      const phases = await this.competitionFormatsService.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);
      this.selectedPhaseType.set(this.groupStagePhase() ? 'GROUP_STAGE' : 'KNOCKOUT');
      await this.onPhaseTypeSelected();
    } catch {
      this.errorMessage.set('Impossible de charger les phases.');
    }
  }

  protected async onPhaseTypeChange(type: string): Promise<void> {
    this.selectedPhaseType.set(type as CompetitionPhaseType | 'ALL');
    await this.onPhaseTypeSelected();
  }

  private async onPhaseTypeSelected(): Promise<void> {
    if (this.selectedPhaseType() === 'GROUP_STAGE') {
      const phase = this.groupStagePhase();
      if (phase) {
        this.matchDurationMinutes.set(String(phase.matchDurationMinutes));
        this.breakDurationMinutes.set(String(phase.breakDurationMinutes));
        // Empty (not '0') when there's no referee -- the field itself is
        // hidden in that case, and generateSchedule() treats an empty
        // string as "omit", whereas '0' would be sent as-is and rejected by
        // the backend's @Min(1) validation.
        this.refereesPerMatch.set(this.hasReferees() ? String(phase.refereesPerMatch) : '');
      }
    } else if (this.selectedPhaseType() === 'KNOCKOUT') {
      // Tier 1 leads -- same convention as the qualification-tiers feature
      // (best-of-position joins tier 1's bracket), the organizer can still
      // override before generating.
      const tier1 = this.knockoutPhases()[0];
      if (tier1) {
        this.matchDurationMinutes.set(String(tier1.matchDurationMinutes));
        this.breakDurationMinutes.set(String(tier1.breakDurationMinutes));
      }
    }
    await this.loadMatches();
  }

  private async loadMatches(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      const results = await Promise.all(
        this.activePhases().map((phase) =>
          this.scheduleService.listMatches(organizationId, this.tournamentId, phase.id),
        ),
      );
      this.matches.set(results.flat());
    } catch {
      this.errorMessage.set('Impossible de charger le calendrier.');
    }
  }

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

  protected onBreakAfterPoolsMinutesChange(value: string): void {
    this.breakAfterPoolsMinutes.set(value);
  }

  protected async generateSchedule(): Promise<void> {
    const organizationId = this.organization()?.id;
    const phaseId = this.groupStagePhase()?.id;
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

  /**
   * Generates every knockout tier's matches together (see
   * BracketsService.generateAllMatches) -- with several tiers, they share
   * fields in one continuous rotation, so they can't be generated one at a
   * time the way a single bracket's matches are. Reserves a slot for every
   * round of every tier up front (round 1 immediately gets real opponents;
   * later rounds claim their reservation automatically once known, as their
   * own scores validate). The start time is usually not entered by hand --
   * it's the pool phase's last scheduled match plus the configured pause --
   * except for a category with no real pool phase (KNOCKOUT_ONLY structure
   * preset, see groupStagePhase), where the organizer picks it directly
   * (reusing the same startDateTime field the pool-phase generation form
   * uses, which is otherwise unreachable here since there's no "Poules" tab
   * to show it on).
   */
  protected async generateAllKnockoutMatches(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    const fieldIds = this.selectedFieldIds();
    const hasPoolPhase = this.groupStagePhase() !== null;
    const breakAfterPoolsMinutes = this.breakAfterPoolsMinutes();
    const startDateTime = this.startDateTime();
    if (!organizationId || !categoryId) {
      return;
    }
    if (fieldIds.length === 0) {
      this.errorMessage.set('Sélectionnez au moins un terrain avant de générer les tableaux.');
      return;
    }
    if (hasPoolPhase && breakAfterPoolsMinutes === '') {
      this.errorMessage.set('Renseignez le temps de pause après les poules.');
      return;
    }
    if (!hasPoolPhase && !startDateTime) {
      this.errorMessage.set('Renseignez une date de début avant de générer les tableaux.');
      return;
    }
    this.errorMessage.set(null);
    this.generating.set(true);
    try {
      const generated = await this.competitionFormatsService.generateAllBracketMatches(
        organizationId,
        this.tournamentId,
        categoryId,
        {
          fieldIds,
          ...(hasPoolPhase
            ? { breakAfterPoolsMinutes: Number(breakAfterPoolsMinutes) }
            : { startDateTime: new Date(startDateTime).toISOString() }),
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
      this.errorMessage.set(
        error instanceof HttpErrorResponse &&
          typeof (error.error as { message?: unknown })?.message === 'string'
          ? (error.error as { message: string }).message
          : 'Impossible de générer les matchs des tableaux.',
      );
    } finally {
      this.generating.set(false);
    }
  }

  protected async resetSchedule(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await Promise.all(
        this.activePhases().map((phase) =>
          this.scheduleService.resetSchedule(organizationId, this.tournamentId, phase.id),
        ),
      );
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

  // "Poules · 1/4" / "LDC · 1/4" -- the grid groups cards by field/time, not
  // by phase or round, so with several knockout tiers shown together (or
  // even just poules vs. élimination directe) the card itself needs to say
  // which phase it belongs to, not just which round.
  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url);
  }

  protected roundDisplay(match: Match): string {
    const phase = this.phaseForMatch(match);
    if (!phase) {
      return `Tour ${match.round}`;
    }
    const phaseLabel = phase.type === 'GROUP_STAGE' ? 'Poules' : phase.name;
    return `${phaseLabel} · ${matchRoundLabel(phase, match, 'compact')}`;
  }

  // Resolved from the match itself (not the current filter) -- needed as-is
  // for 'ALL', where matches from several phases are shown together.
  private phaseForMatch(match: Match): CompetitionPhase | undefined {
    if (match.knockoutBracketId) {
      return this.knockoutPhases().find(
        (phase) => phase.knockoutBracket?.id === match.knockoutBracketId,
      );
    }
    return this.groupStagePhase() ?? undefined;
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

  // Tap #1: select a match (or deselect it if it's already selected).
  protected onMatchTap(matchId: string): void {
    this.selectedMatchId.update((current) => (current === matchId ? null : matchId));
  }

  // Tap #2: place the selected match into this empty slot. No-op if nothing
  // is selected (a plain tap on an empty slot, not part of a move) --
  // matchBySlotId().has(timeSlotId) is checked in the template via
  // schedule-page__slot--target, this only guards against the async gap
  // between taps.
  protected async onSlotTap(timeSlotId: string): Promise<void> {
    const matchId = this.selectedMatchId();
    if (!matchId) {
      return;
    }
    this.selectedMatchId.set(null);
    await this.moveMatchToSlot(matchId, timeSlotId);
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
