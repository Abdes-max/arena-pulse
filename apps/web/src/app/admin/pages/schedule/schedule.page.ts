import { TournamentReviewPage } from '../review/tournament-review.page';
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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { LanguageService } from 'design-tokens';
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
  TournamentDetail,
  Venue,
} from '../../core/models';
import { RefereesService } from '../../core/referees.service';
import { ScheduleService } from '../../core/schedule.service';
import { TeamsService } from '../../core/teams.service';
import { TimeSlotsService } from '../../core/timeslots.service';
import { TournamentsService } from '../../core/tournaments.service';
import { FieldSelector } from '../../shared/field-selector';
import { summarizeSchedule } from '../../shared/schedule-summary';
import { matchRoundLabel, RoundLabelLang } from 'shared-models';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';

// Adding a slot: just a length; it goes right after the field's last slot.
interface TimeSlotDraft {
  minutes: string;
  label: string;
}

@Component({
  selector: 'app-schedule-page',
  imports: [
    Button,
    Select,
    TextField,
    NgTemplateOutlet,
    FieldSelector,
    TournamentReviewPage,
    TranslocoPipe,
  ],
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
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);
  protected readonly generating = signal(false);

  // Only startDate/endDate (set on Général) are actually used here, as the
  // bounds the schedule-generation date must fall within -- see
  // isStartDateTimeWithinTournamentRange below. Kept as the full
  // TournamentDetail rather than two bare signals since it's already
  // fetched as one object alongside categories/venues/referees in
  // loadCategories.
  protected readonly tournament = signal<TournamentDetail | null>(null);
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
  protected readonly summary = computed(() => {
    const type = this.selectedPhaseType();
    return summarizeSchedule(
      this.matches().filter((match) =>
        type === 'GROUP_STAGE'
          ? match.groupId !== null
          : type === 'KNOCKOUT'
            ? match.knockoutBracketId !== null
            : true,
      ),
    );
  });
  protected readonly startDateTime = signal('');
  protected readonly shifting = signal(false);
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
    const lang = this.languageService.language();
    const options: SelectOption[] = [];
    if (this.groupStagePhase() || this.knockoutPhases().length > 0) {
      options.push({
        value: 'ALL',
        label: this.transloco.translate('admin.schedule.allOption', {}, lang),
      });
    }
    if (this.groupStagePhase()) {
      options.push({
        value: 'GROUP_STAGE',
        label: this.transloco.translate('admin.structure.typeGroupStage', {}, lang),
      });
    }
    if (this.knockoutPhases().length > 0) {
      options.push({
        value: 'KNOCKOUT',
        label: this.transloco.translate('admin.structure.typeKnockout', {}, lang),
      });
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
      this.tournament.set(tournament);
      this.teamsCanReferee.set(tournament.teamsCanReferee);
      this.referees.set(referees);
      // Pre-fills the generation form's own start field with Général's
      // startDate (date only -- datetime-local still needs a time, defaulted to a
      // typical 09:00 kickoff for the organizer to adjust) so there's one less thing to
      // retype when just opening this page, not a default that could ever
      // clobber something the organizer already typed (load() only runs
      // once, before startDateTime could hold anything else).
      if (tournament.startDate) {
        this.startDateTime.set(`${tournament.startDate.slice(0, 10)}T09:00`);
      }
      await this.loadTimeSlots();
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadTeams();
        await this.loadPhases();
      }
    } catch {
      this.errorMessage.set('admin.schedule.errors.loadCategories');
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
      this.errorMessage.set('admin.schedule.errors.loadTeams');
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
      this.errorMessage.set('admin.schedule.errors.loadPhases');
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

  // "Vérifier mon programme" at the bottom (key numbers + publish).
  private readonly review = viewChild(TournamentReviewPage);

  private async loadMatches(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      // Every phase, whatever the filter: a slot holding a match of another
      // phase must never look free in the grid.
      const groupPhase = this.groupStagePhase();
      const results = await Promise.all(
        [...(groupPhase ? [groupPhase] : []), ...this.knockoutPhases()].map((phase) =>
          this.scheduleService.listMatches(organizationId, this.tournamentId, phase.id),
        ),
      );
      this.matches.set(results.flat());
      this.review()?.reload();
    } catch {
      this.errorMessage.set('admin.schedule.errors.loadMatches');
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

  // Compares calendar days only, not full instants -- Général's
  // startDate/endDate carry no real time-of-day (always stored at UTC
  // midnight, see tournament-form.page.ts's own date fields), so comparing
  // full Date instants would reject a perfectly valid local morning kickoff
  // sitting right at that UTC-midnight boundary. true (no rejection) when
  // the tournament has neither bound set, same "nothing to check against"
  // reasoning as elsewhere in this codebase.
  private isStartDateTimeWithinTournamentRange(startDateTime: string): boolean {
    const tournament = this.tournament();
    if (!tournament) {
      return true;
    }
    const pickedDay = startDateTime.slice(0, 10);
    if (tournament.startDate && pickedDay < tournament.startDate.slice(0, 10)) {
      return false;
    }
    if (tournament.endDate && pickedDay > tournament.endDate.slice(0, 10)) {
      return false;
    }
    return true;
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
      this.errorMessage.set('admin.schedule.errors.selectFieldForSchedule');
      return;
    }
    if (!startDateTime) {
      this.errorMessage.set('admin.schedule.errors.enterStartDateForSchedule');
      return;
    }
    if (!this.isStartDateTimeWithinTournamentRange(startDateTime)) {
      this.errorMessage.set('admin.schedule.errors.startDateOutsideTournamentRange');
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
        this.errorMessage.set('admin.schedule.errors.noMatchesGenerated');
      }
      await this.loadTimeSlots();
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'admin.schedule.errors.matchesAlreadyExist'
          : 'admin.schedule.errors.generateScheduleGeneric',
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
      this.errorMessage.set('admin.schedule.errors.selectFieldForBrackets');
      return;
    }
    if (hasPoolPhase && breakAfterPoolsMinutes === '') {
      this.errorMessage.set('admin.schedule.errors.enterBreakAfterPools');
      return;
    }
    if (!hasPoolPhase && !startDateTime) {
      this.errorMessage.set('admin.schedule.errors.enterStartDateForBrackets');
      return;
    }
    if (!hasPoolPhase && !this.isStartDateTimeWithinTournamentRange(startDateTime)) {
      this.errorMessage.set('admin.schedule.errors.startDateOutsideTournamentRange');
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
          : 'admin.schedule.errors.generateBracketsGeneric',
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
      this.errorMessage.set('admin.schedule.errors.resetSchedule');
    }
  }

  /**
   * "On a 5 minutes de retard": moves every upcoming match of the phases in
   * view. Phases can share fields, so a later phase is moved first when
   * pushing back (and last when pulling forward) -- otherwise the first move
   * would briefly overlap the next phase's slots and be rejected.
   */
  protected async shiftSchedule(minutes: number): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || this.shifting()) {
      return;
    }
    const phases = minutes > 0 ? [...this.activePhases()].reverse() : this.activePhases();
    this.errorMessage.set(null);
    this.shifting.set(true);
    try {
      for (const phase of phases) {
        await this.scheduleService
          .shiftSchedule(organizationId, this.tournamentId, phase.id, minutes)
          .catch((error: unknown) => {
            // A phase with nothing left to play (400) is simply skipped.
            if (!(error instanceof HttpErrorResponse && error.status === 400)) {
              throw error;
            }
          });
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'admin.schedule.errors.shiftConflict'
          : 'admin.schedule.errors.shiftGeneric',
      );
    } finally {
      await this.loadMatches();
      await this.loadTimeSlots();
      this.shifting.set(false);
    }
  }

  protected formatClock(time: string | null): string {
    return time
      ? new Date(time).toLocaleTimeString(this.languageService.language(), {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }

  protected formatSlotTime(startTime: string): string {
    return new Date(startTime).toLocaleString(this.languageService.language(), {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  protected slotClock(slot: TimeSlot): string {
    return this.formatSlotTime(slot.startTime);
  }

  protected slotTimeLabel(slot: TimeSlot): string {
    return slot.label
      ? `${this.formatSlotTime(slot.startTime)}, ${slot.label}`
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
    // LanguageService.language() is typed Signal<string> (it aliases
    // TranslocoService.activeLang directly, see language.service.ts) --
    // narrowed here since the app only ever sets it to one of the 6
    // RoundLabelLang-compatible codes (LanguageService.setLanguage only
    // accepts LanguageCode, same 6 values).
    const lang = this.languageService.language() as RoundLabelLang;
    const phase = this.phaseForMatch(match);
    if (!phase) {
      return this.transloco.translate('admin.schedule.round', { round: match.round }, lang);
    }
    const phaseLabel =
      phase.type === 'GROUP_STAGE'
        ? this.transloco.translate('admin.structure.typeGroupStage', {}, lang)
        : phase.name;
    return `${phaseLabel} · ${matchRoundLabel(phase, match, 'compact', lang)}`;
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
      {
        value: '',
        label: this.transloco.translate(
          'admin.schedule.addRefereeOption',
          {},
          this.languageService.language(),
        ),
      },
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
      {
        value: '',
        label: this.transloco.translate(
          'admin.schedule.addRefereeingTeamOption',
          {},
          this.languageService.language(),
        ),
      },
      ...this.availableRefereeingTeams(match).map((team) => ({ value: team.id, label: team.name })),
    ];
  }

  protected onMatchDragStart(matchId: string, event: DragEvent): void {
    this.draggedMatchId.set(matchId);
    this.draggedSlotId.set(null);
    event.dataTransfer?.setData('text/plain', matchId);
  }

  // ---- Drag & drop with reflow: the line shows where it lands, the
  // following slots shift on both columns once dropped. ----
  protected readonly draggedSlotId = signal<string | null>(null);
  protected readonly dropTarget = signal<{ fieldId: string; index: number } | null>(null);

  protected onSlotDragStart(slotId: string, event: DragEvent): void {
    this.draggedMatchId.set(null);
    this.draggedSlotId.set(slotId);
    event.dataTransfer?.setData('text/plain', slotId);
  }

  protected onDragEnd(): void {
    this.dropTarget.set(null);
    this.draggedMatchId.set(null);
    this.draggedSlotId.set(null);
  }

  // Slot being dragged (a match drags its own slot), to fade it and to
  // compute where the rest of its column goes.
  protected readonly draggedSlot = computed(() => {
    const slotId =
      this.draggedSlotId() ??
      this.matches().find((match) => match.id === this.draggedMatchId())?.timeSlot?.id ??
      null;
    if (!slotId) {
      return null;
    }
    for (const [fieldId, slots] of this.timeSlotsByField()) {
      const index = slots.findIndex((slot) => slot.id === slotId);
      if (index >= 0) {
        return { fieldId, index, slot: slots[index] };
      }
    }
    return null;
  });

  // Position in the target column once the dragged slot has left it (what the API expects).
  private dropIndex(target: { fieldId: string; index: number }): number {
    const dragged = this.draggedSlot();
    return dragged && dragged.fieldId === target.fieldId && dragged.index < target.index
      ? target.index - 1
      : target.index;
  }

  // Time the dropped match / slot will start at, shown in the placeholder.
  protected readonly dropPreviewTime = computed(() => {
    const target = this.dropTarget();
    if (!target) {
      return null;
    }
    const dragged = this.draggedSlot();
    const lengthMs = dragged
      ? new Date(dragged.slot.endTime).getTime() - new Date(dragged.slot.startTime).getTime()
      : 0;
    const column = (this.timeSlotsByField().get(target.fieldId) ?? [])
      .filter((slot) => slot.id !== dragged?.slot.id)
      .map((slot) => {
        const start = new Date(slot.startTime).getTime();
        // Same column: what came after the dragged slot moves up.
        const moved =
          dragged?.fieldId === target.fieldId &&
          start >= new Date(dragged.slot.startTime).getTime();
        return {
          start: start - (moved ? lengthMs : 0),
          end: new Date(slot.endTime).getTime() - (moved ? lengthMs : 0),
        };
      });
    const index = this.dropIndex(target);
    const start =
      column.length === 0
        ? dragged
          ? new Date(dragged.slot.startTime).getTime()
          : null
        : index < column.length
          ? column[index].start
          : column[column.length - 1].end;
    return start === null ? null : this.formatClock(new Date(start).toISOString());
  });

  // Above or below the hovered slot, from the pointer's height.
  protected onSlotDragOverAt(fieldId: string, index: number, event: DragEvent): void {
    if (!this.draggedMatchId() && !this.draggedSlotId()) {
      return;
    }
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const target = { fieldId, index: index + (after ? 1 : 0) };
    const current = this.dropTarget();
    if (current?.fieldId !== target.fieldId || current.index !== target.index) {
      this.dropTarget.set(target);
    }
  }

  // Lets the drop happen anywhere in the column (the placeholder included).
  protected onColumnDragOver(event: DragEvent): void {
    if (this.draggedMatchId() || this.draggedSlotId()) {
      event.preventDefault();
    }
  }

  protected onColumnEndDragOver(fieldId: string, event: DragEvent): void {
    if (!this.draggedMatchId() && !this.draggedSlotId()) {
      return;
    }
    event.preventDefault();
    const index = (this.timeSlotsByField().get(fieldId) ?? []).length;
    const current = this.dropTarget();
    if (current?.fieldId !== fieldId || current.index !== index) {
      this.dropTarget.set({ fieldId, index });
    }
  }

  protected async onColumnDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const target = this.dropTarget();
    const matchId = this.draggedMatchId();
    const slotId = this.draggedSlotId();
    const index = target ? this.dropIndex(target) : 0;
    this.dropTarget.set(null);
    this.draggedMatchId.set(null);
    this.draggedSlotId.set(null);
    const organizationId = this.organization()?.id;
    if (!target || !organizationId || (!matchId && !slotId)) {
      return;
    }
    this.errorMessage.set(null);
    try {
      await this.timeSlotsService.moveWithReflow(organizationId, this.tournamentId, {
        ...(slotId ? { timeSlotId: slotId } : { matchId: matchId! }),
        fieldId: target.fieldId,
        index,
        minutes: Number(this.matchDurationMinutes()) || undefined,
      });
      await Promise.all([this.loadTimeSlots(), this.loadMatches()]);
    } catch (error) {
      this.errorMessage.set(this.apiMessage(error) ?? 'admin.schedule.errors.moveMatchGeneric');
    }
  }

  // The API's own sentence (it names the team) when it sends one.
  private apiMessage(error: unknown): string | null {
    const message =
      error instanceof HttpErrorResponse
        ? (error.error as { message?: unknown } | null)?.message
        : null;
    return typeof message === 'string' ? message : null;
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
          ? (this.apiMessage(error) ?? 'admin.schedule.errors.slotUnavailable')
          : 'admin.schedule.errors.moveMatchGeneric',
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
          ? 'admin.schedule.errors.officialConflict'
          : 'admin.schedule.errors.addOfficialGeneric',
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
      this.errorMessage.set('admin.schedule.errors.removeOfficial');
    }
  }

  protected draftFor(fieldId: string): TimeSlotDraft {
    return (
      this.newSlotDrafts().get(fieldId) ?? {
        minutes: this.matchDurationMinutes() || '30',
        label: '',
      }
    );
  }

  // Right after the field's last slot; on an empty field, at the earliest
  // slot of the others (or now).
  private nextSlotStart(fieldId: string): Date {
    const own = this.timeSlotsByField().get(fieldId) ?? [];
    if (own.length > 0) {
      return new Date(own[own.length - 1].endTime);
    }
    const starts = [...this.timeSlotsByField().values()]
      .flat()
      .map((slot) => slot.startTime)
      .sort();
    return starts.length > 0 ? new Date(starts[0]) : new Date();
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
    const minutes = Math.round(Number(this.draftFor(fieldId).minutes));
    if (!organizationId || !Number.isFinite(minutes) || minutes <= 0) {
      return;
    }
    const start = this.nextSlotStart(fieldId);
    this.errorMessage.set(null);
    try {
      const slot = await this.timeSlotsService.createTimeSlot(
        organizationId,
        this.tournamentId,
        fieldId,
        {
          startTime: start.toISOString(),
          endTime: new Date(start.getTime() + minutes * 60_000).toISOString(),
          label: this.draftFor(fieldId).label.trim() || undefined,
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
      this.onSlotDraftChange(fieldId, 'label', '');
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'admin.schedule.errors.slotOverlap'
          : 'admin.schedule.errors.createSlotGeneric',
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
      this.errorMessage.set('admin.schedule.errors.deleteSlot');
    }
  }
}
