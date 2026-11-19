import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonContent,
  IonFooter,
  IonHeader,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular/standalone';
import {
  AddressSearchService,
  AssetUrlService,
  ClubSearchService,
  clubDirectorySport,
  ClubSuggestion,
  PublicApiService,
} from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AutocompleteField, Button, TextField } from 'design-system';
import {
  PublicSport,
  PublicTheme,
  matchRoundLabel,
  RECOMMENDED_HEADER_BACKGROUND,
  headerBackgroundPresetsFor,
  HeaderBackgroundPreset,
  headerBackgroundPresetOf,
  headerBackgroundPresetUrl,
} from 'shared-models';
import {
  CompetitionPhase,
  Match,
  RoundLabelLang,
  matchRoundLabel as boardRoundLabel,
} from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { OrganizerScheduleService, ScheduleSlot } from '../../core/schedule.service';
import { IapCancelledError, IapService } from '../../core/iap.service';
import {
  OrganizerPhase,
  PublicationQuote,
  TournamentStatus,
  WizardStructureFormat,
} from '../../core/models';
import {
  OrganizationSubscriptionStatus,
  OrganizerOrganizationsService,
} from '../../core/organizations.service';
import { MatchSummary, TournamentCreationService } from '../../core/tournament-creation.service';
import { assignPastedNames, isPlaceholderTeamName } from '../../core/placeholder-teams';
import { OrganizerTeamsService } from '../../core/teams.service';
import { OrganizerTournamentsService } from '../../core/tournaments.service';
import { environment } from '../../../../environments/environment';
import { isIosNative } from '../../../core/native-platform.util';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';

const CLUB_SEARCH_STORAGE_KEY = 'ta.teamClubSearch';

/**
 * A team of the "Équipes" step. id is null for a create-mode entry not yet
 * committed to the API (see submitTeams(), still batched at "Suivant"
 * there) and always set in edit mode, where add/remove act immediately.
 * logoUrl is the team logo, or before creation the picked club's crest.
 */
interface WizardTeam {
  id: string | null;
  name: string;
  externalClubId?: string | null;
  logoUrl?: string | null;
}

/** Club search is on unless the organizer turned it off (remembered per device). */
function readClubSearchPreference(): boolean {
  try {
    return localStorage.getItem(CLUB_SEARCH_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 'done';

// Matches apps/api's Tournament.theme column default (Prisma schema) --
// never sent at creation time, see submitInfos()'s own comment on why.
const DEFAULT_THEME: PublicTheme = 'INK_SIGNAL';

// 5-step creation wizard (Infos / Équipes / Structure / Calendrier /
// Publication) + a final confirmation state, matching the approved mockup
// (adaptive-leaping-elephant.md, Étape 0) 1:1 in structure: one screen, a
// rail stepper (see the template), a scrollable step body, a pinned
// back/next footer. Each step commits its own data to the API as the
// organizer advances (not all at once at the end) -- see nextStep() --
// mirroring how the mockup's own state (teams/format/poolCount/qualCount)
// only turns into anything real once you leave a step, and matching this
// app's PR 1 pattern of always leaving the organizer on a real, reloadable
// resource rather than losing work on a mid-wizard app close.
//
// The wizard's steps are a deliberately narrowed "fast path" onto a richer
// real domain model (categories, venues/fields, multi-tier brackets --
// see tournament-creation.service.ts's own comment): one implicit category
// and one implicit venue/field get created transparently, never surfaced
// as their own screens here. The full editor for all of that stays
// admin-web-only for now.
//
// Also doubles as the edit-mode entry point for an EXISTING tournament
// (route 'organizer/tournaments/:id/edit', see app.routes.ts) instead of a
// second, parallel screen -- mode() (derived from the route's 'id' param)
// governs the few places create and edit genuinely diverge:
// - Infos/Équipes act immediately (PATCH/POST/DELETE per keystroke or tap)
//   instead of queuing everything up for one create-time submit.
// - Structure/Calendrier become read-only summaries once real data already
//   exists (StructurePresetsService.create, apps/api, refuses to run again
//   on a non-empty category -- there's no "re-generate" to offer here).
// - Publication reflects and acts on the tournament's real current status
//   (Publier/Dépublier/Republier) instead of always being a first publish.
// - The rail becomes directly clickable (all data is already loaded, no
//   reason to force a linear walk to reach e.g. step 5 to just publish).
/** A publication step that failed, with the i18n key naming which one -- the Publication step used to collapse them all into one generic message, which made a failing payment impossible to diagnose from a phone. */
class PublishStageError extends Error {
  constructor(
    readonly key: string,
    readonly origin: unknown,
  ) {
    super(key);
  }
}

/** Short technical hint (HTTP status + server message, or the raw error message) shown under a publication error. */
function describeError(error: unknown): string {
  const value = error as { status?: number; error?: { message?: unknown }; message?: unknown };
  const serverMessage = value.error?.message;
  const message =
    typeof serverMessage === 'string'
      ? serverMessage
      : Array.isArray(serverMessage)
        ? serverMessage.join(', ')
        : typeof value.message === 'string'
          ? value.message
          : '';
  return [value.status ? 'HTTP ' + value.status : '', message]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 200);
}

@Component({
  selector: 'app-organizer-tournament-wizard-page',
  imports: [
    AutocompleteField,
    Button,
    DatePipe,
    NgTemplateOutlet,
    IonContent,
    IonFooter,
    IonHeader,
    IonTitle,
    IonToolbar,
    TextField,
    TranslocoPipe,
  ],
  templateUrl: './tournament-wizard.page.html',
  styleUrl: './tournament-wizard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerTournamentWizardPage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly tournamentsApi = inject(OrganizerTournamentsService);
  private readonly teamsApi = inject(OrganizerTeamsService);
  private readonly creationApi = inject(TournamentCreationService);
  private readonly scheduleApi = inject(OrganizerScheduleService);
  private readonly organizationsApi = inject(OrganizerOrganizationsService);
  private readonly publicApi = inject(PublicApiService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly iap = inject(IapService);
  private readonly transloco = inject(TranslocoService);
  private readonly navController = inject(NavController);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly mode = signal<'create' | 'edit'>('create');
  // True only while the initial edit-mode preload is in flight -- distinct
  // from submitting() (a per-action spinner for both modes), this guards
  // the whole step content from rendering (and the rail from being tapped)
  // before there's anything real to show.
  protected readonly initializing = signal(false);
  protected readonly currentStatus = signal<TournamentStatus>('DRAFT');
  // Non-null once loadForEdit finds a real (non-seed) phase already on the
  // category -- StructurePresetsService.create (apps/api) refuses to run
  // again once that's true, so the Structure step switches to a read-only
  // summary instead of re-offering the format picker.
  protected readonly structureSummary = signal<string | null>(null);

  protected readonly step = signal<WizardStep>(1);
  // Rail-comparison helper: the rail (1..5 dots) never renders once step()
  // is 'done' (see the template's own guard), but step() is still typed as
  // the full WizardStep union wherever it's read -- this keeps the rail's
  // arithmetic (n < stepNumber(), etc.) on a plain number instead of
  // fighting that union at every comparison.
  protected readonly stepNumber = computed(() => {
    const current = this.step();
    return current === 'done' ? 5 : current;
  });
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly errorDetail = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage, {
    detail: this.errorDetail,
  });

  // ---- Step 1: Infos ----
  protected readonly sports = signal<PublicSport[]>([]);
  protected readonly name = signal('');
  protected readonly sportId = signal('');
  protected readonly isOnline = signal(false);
  protected readonly venueName = signal('');
  // Full address of the picked search suggestion (saved as Venue.address),
  // dropped as soon as the name is retyped by hand.
  protected readonly venueAddress = signal<string | null>(null);
  protected readonly venueSearch = inject(AddressSearchService).autocomplete(() =>
    this.transloco.getActiveLang(),
  );
  // Tournament day (yyyy-mm-dd), shown in the public header. Also the
  // Calendrier step's default first-match day.
  protected readonly startDate = signal(tomorrowIsoDate());
  protected readonly theme = signal<PublicTheme>(DEFAULT_THEME);
  protected readonly themes: PublicTheme[] = [
    'INK_SIGNAL',
    'PULSE_EMBER',
    'NEON_COURT',
    'FRESH_PITCH',
    'CRIMSON_CHARGE',
  ];
  protected readonly logoFile = signal<File | null>(null);

  // Header background: one of the ready-made presets, or "other" with an
  // uploaded photo (premium, best-effort like the logo). headerBackgroundSaved
  // is what the server has, so an untouched choice isn't re-sent.
  // The selected theme's matching preset comes first, flagged "Recommandé".
  protected readonly headerBackgroundPresets = computed(() =>
    headerBackgroundPresetsFor(this.theme()),
  );
  protected readonly recommendedHeaderBackground = computed(
    () => RECOMMENDED_HEADER_BACKGROUND[this.theme()],
  );
  protected readonly headerBackgroundPresetUrl = headerBackgroundPresetUrl;
  protected readonly headerBackgroundChoice = signal<HeaderBackgroundPreset | 'other' | null>(null);
  protected readonly headerBackgroundFile = signal<File | null>(null);
  private headerBackgroundSaved: HeaderBackgroundPreset | 'other' | null = null;

  private tournamentId: string | null = null;
  // Edit mode: the end date already saved (web form only) -- pushed along
  // when the new start date would land after it.
  private loadedEndDate: string | null = null;
  private existingVenue: { id: string; name: string; address: string | null } | null = null;
  private organizationId: string | null = null;
  private categoryId: string | null = null;

  // ---- Step 2: Équipes ----
  protected readonly teamInput = signal('');
  // See WizardTeam -- add/remove: addTeam()/removeTeam().
  protected readonly teams = signal<WizardTeam[]>([]);
  // Inline rename in the teams table (one row at a time).
  protected readonly editingTeamIndex = signal<number | null>(null);
  protected readonly editTeamName = signal('');
  // Club search (sports with a club directory, see clubDirectorySport),
  // same as apps/web's team-list.page: the name field becomes an
  // autocomplete over that sport's clubs, picking a club links it
  // (externalClubId) and its crest becomes the team logo. Retyping the name
  // drops the link.
  private readonly sportName = computed(
    () => this.sports().find((s) => s.id === this.sportId())?.name ?? '',
  );
  private readonly clubSport = computed(() => clubDirectorySport(this.sportName()));
  protected readonly clubSearch = inject(ClubSearchService).autocomplete(
    () => this.clubSport() ?? 'football',
  );
  protected readonly clubSearchAvailable = computed(() => this.clubSport() !== null);

  // "Organisé par un club de <sport>" (Infos step): the organizer picks
  // their club, whose crest becomes the tournament logo (apps/api).
  protected readonly organizerSportLabel = computed(() => this.sportName().toLowerCase());
  protected readonly organizerByClub = signal(false);
  protected readonly organizerClubId = signal('');
  protected readonly organizerClubLabel = signal('');
  protected readonly organizerClubQuery = signal('');
  protected readonly organizerClubSearch = inject(ClubSearchService).autocomplete(
    () => this.clubSport() ?? 'football',
  );
  protected readonly organizerClubSuggestions = computed(() =>
    this.organizerClubSearch.suggestions().map((club) => ({
      label: club.name,
      detail: this.clubLocation(club),
      imageUrl: this.assetUrl.resolve(club.logoUrl),
    })),
  );
  protected readonly useClubSearch = signal(readClubSearchPreference());
  protected readonly clubSuggestions = computed(() =>
    this.clubSearch.suggestions().map((club) => ({
      label: club.name,
      detail: this.clubLocation(club),
      imageUrl: this.assetUrl.resolve(club.logoUrl),
    })),
  );
  protected readonly teamClubId = signal('');
  // Crest of the picked club, shown in the table before the team exists.
  private readonly teamClubLogo = signal<string | null>(null);

  // ---- Step 3: Structure ----
  protected readonly format = signal<WizardStructureFormat>('pools-knockout');
  protected readonly poolCount = signal('4');
  protected readonly qualifiersPerPool = signal('2');

  // ---- Step 4: Calendrier ----
  protected readonly matches = signal<MatchSummary[] | null>(null);
  protected readonly generatingSchedule = signal(false);
  private groupPhaseId: string | null = null;
  // Generation settings -- used to be a hard-coded "tomorrow 09:00, one
  // field". Several fields now play in shared rotations (see
  // rotation-scheduling.util.ts, apps/api), so a plateau on 2-3 fields gets
  // a calendar that actually fits its morning.
  protected readonly scheduleDate = signal(tomorrowIsoDate());
  protected readonly scheduleTime = signal('09:00');
  protected readonly fieldCount = signal('1');
  protected readonly matchDurationMinutes = signal('');
  protected readonly breakDurationMinutes = signal('');
  protected readonly shiftingSchedule = signal(false);

  // ---- Step 5: Publication ----
  protected readonly isListed = signal(true);
  protected readonly checkoutOpened = signal(false);
  // Set instead of checkoutOpened when submitPublish() hits PENDING_PAYMENT
  // on the native iOS build -- see isIosNative's own comment (App Review
  // guideline 3.1.1, no in-app purchase flow other than IAP on iOS).
  protected readonly paymentBlockedOnIos = signal(false);
  // Edit mode on an already-published tournament: "Republier" pushes the
  // changes through publish() again, which charges the gap if they crossed
  // a paid tier (e.g. teams added) -- quoted up front so the organizer
  // knows before tapping. Null while loading / not applicable.
  protected readonly publicationQuote = signal<PublicationQuote | null>(null);
  protected readonly republished = signal(false);
  protected readonly isRepublish = computed(
    () => this.mode() === 'edit' && this.currentStatus() === 'PUBLISHED',
  );
  protected readonly publishedTournamentName = signal('');
  // Computed once (the platform never changes mid-session), not re-evaluated
  // per template read -- same "resolved once, plain field" style as this
  // component's IDs (organizationId/tournamentId/...).
  protected readonly isIosNative = isIosNative();
  // "Plan" block, right below the payment hint -- shows the organization's
  // current subscription regardless of team count/tier, same reasoning as
  // apps/web's tournament-form.page.ts own addition right next to its
  // "Paiement de publication" section.
  protected readonly subscriptionStatus = signal<OrganizationSubscriptionStatus | null>(null);

  // ---- Step 4: Calendrier board (slots per field, "+ Créneau", drag & drop
  // with reflow -- same as the web Calendrier). Loaded whenever a calendar
  // exists (edit mode, or once generated). ----
  private readonly content = viewChild(IonContent);
  protected readonly boardFields = signal<{ id: string; name: string }[]>([]);
  protected readonly boardSlots = signal<Map<string, ScheduleSlot[]>>(new Map());
  protected readonly boardMatches = signal<Match[]>([]);
  private readonly boardPhases = signal<CompetitionPhase[]>([]);
  protected readonly slotDrafts = signal<Record<string, { minutes: string; label: string }>>({});

  protected readonly boardMatchBySlot = computed(() => {
    const map = new Map<string, Match>();
    for (const match of this.boardMatches()) {
      if (match.timeSlot) {
        map.set(match.timeSlot.id, match);
      }
    }
    return map;
  });

  private async loadBoard(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const categoryId = this.categoryId;
    if (!organizationId || !tournamentId || !categoryId) {
      return;
    }
    try {
      const [venues, phases] = await Promise.all([
        this.scheduleApi.listVenues(organizationId, tournamentId),
        this.scheduleApi.listPhases(organizationId, tournamentId, categoryId),
      ]);
      const fields = venues.flatMap((venue) =>
        [...(venue.fields ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((field) => ({ id: field.id, name: field.name })),
      );
      const realPhases = phases.filter((phase) => !phase.isSeedPhase);
      const [slotLists, matchLists] = await Promise.all([
        Promise.all(
          fields.map((f) => this.scheduleApi.listSlots(organizationId, tournamentId, f.id)),
        ),
        Promise.all(
          realPhases.map((p) => this.scheduleApi.listMatches(organizationId, tournamentId, p.id)),
        ),
      ]);
      this.boardFields.set(fields);
      this.boardPhases.set(realPhases);
      this.boardSlots.set(
        new Map(
          fields.map((f, i) => [
            f.id,
            [...slotLists[i]].sort((a, b) => a.startTime.localeCompare(b.startTime)),
          ]),
        ),
      );
      this.boardMatches.set(matchLists.flat());
    } catch {
      // The plain list above stays usable.
    }
  }

  // Phase filter: hides the other phase's matches (free slots stay visible).
  protected readonly boardPhaseFilter = signal<'ALL' | 'GROUP_STAGE' | 'KNOCKOUT'>('ALL');
  protected readonly boardHasKnockout = computed(() =>
    this.boardPhases().some((phase) => phase.type === 'KNOCKOUT'),
  );

  protected slotShown(slot: ScheduleSlot): boolean {
    const filter = this.boardPhaseFilter();
    const match = this.boardMatchBySlot().get(slot.id);
    if (filter === 'ALL' || !match) {
      return true;
    }
    return filter === 'GROUP_STAGE' ? match.groupId !== null : match.knockoutBracketId !== null;
  }

  protected boardRound(match: Match): string {
    const lang = (this.transloco.getActiveLang() || 'fr') as RoundLabelLang;
    const phase = this.boardPhases().find((p) =>
      match.groupId
        ? p.groups.some((group) => group.id === match.groupId)
        : p.knockoutBracket?.id === match.knockoutBracketId,
    );
    if (!phase) {
      return '';
    }
    const label = boardRoundLabel(phase, match, 'compact', lang);
    return phase.type === 'GROUP_STAGE' ? `${phase.name} · ${label}` : label;
  }

  protected boardTeam(team: { name: string } | null, fallback: string | null): string {
    return team?.name ?? fallback ?? '?';
  }

  protected slotDraft(fieldId: string): { minutes: string; label: string } {
    const phase = this.boardPhases()[0] as
      (CompetitionPhase & { matchDurationMinutes?: number }) | undefined;
    return (
      this.slotDrafts()[fieldId] ?? {
        minutes: String(phase?.matchDurationMinutes ?? 30),
        label: '',
      }
    );
  }

  protected setSlotDraft(fieldId: string, key: 'minutes' | 'label', value: string): void {
    this.slotDrafts.update((drafts) => ({
      ...drafts,
      [fieldId]: { ...this.slotDraft(fieldId), [key]: value },
    }));
  }

  // "+ Créneau": the length (and a label), right after the field's last slot.
  protected async addSlot(fieldId: string): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const draft = this.slotDraft(fieldId);
    const minutes = Math.round(Number(draft.minutes));
    if (!organizationId || !tournamentId || !Number.isFinite(minutes) || minutes <= 0) {
      return;
    }
    const own = this.boardSlots().get(fieldId) ?? [];
    const starts = [...this.boardSlots().values()]
      .flat()
      .map((slot) => slot.startTime)
      .sort();
    const start = own.length
      ? new Date(own[own.length - 1].endTime)
      : starts.length
        ? new Date(starts[0])
        : new Date();
    try {
      await this.scheduleApi.createSlot(organizationId, tournamentId, fieldId, {
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + minutes * 60_000).toISOString(),
        label: draft.label.trim() || undefined,
      });
      this.setSlotDraft(fieldId, 'label', '');
      await this.loadBoard();
    } catch (error) {
      this.errorMessage.set(this.boardApiMessage(error) ?? 'organizer.wizard.errorGeneric');
    }
  }

  protected async deleteSlot(slotId: string): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    if (!organizationId || !tournamentId) {
      return;
    }
    try {
      await this.scheduleApi.deleteSlot(organizationId, tournamentId, slotId);
      await this.loadBoard();
    } catch (error) {
      this.errorMessage.set(this.boardApiMessage(error) ?? 'organizer.wizard.errorGeneric');
    }
  }

  private boardApiMessage(error: unknown): string | null {
    const message =
      error && typeof error === 'object' && 'error' in error
        ? ((error as { error?: { message?: unknown } }).error?.message ?? null)
        : null;
    return typeof message === 'string' ? message : null;
  }

  protected boardClock(iso: string): string {
    return new Date(iso).toLocaleString(this.transloco.getActiveLang() || 'fr', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // ---- drag & drop: hold, then the card follows the finger ----
  protected readonly dragItem = signal<{
    slotId: string;
    matchId: string | null;
    fieldId: string;
    index: number;
    width: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  protected readonly ghost = signal<{ x: number; y: number } | null>(null);
  protected readonly dropTarget = signal<{ fieldId: string; index: number } | null>(null);
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressStart: { x: number; y: number } | null = null;

  protected readonly draggedMatch = computed(() => {
    const id = this.dragItem()?.matchId;
    return id ? (this.boardMatches().find((match) => match.id === id) ?? null) : null;
  });
  protected readonly draggedSlot = computed(() => {
    const item = this.dragItem();
    return item
      ? ((this.boardSlots().get(item.fieldId) ?? []).find((slot) => slot.id === item.slotId) ??
          null)
      : null;
  });

  protected onCardTouchStart(
    event: TouchEvent,
    fieldId: string,
    index: number,
    slot: ScheduleSlot,
  ): void {
    const touch = event.touches[0];
    if (!touch || event.touches.length > 1) {
      return;
    }
    const card = event.currentTarget as HTMLElement;
    this.pressStart = { x: touch.clientX, y: touch.clientY };
    this.clearPress();
    this.pressTimer = setTimeout(() => {
      const rect = card.getBoundingClientRect();
      this.dragItem.set({
        slotId: slot.id,
        matchId: this.boardMatchBySlot().get(slot.id)?.id ?? null,
        fieldId,
        index,
        width: rect.width,
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top,
      });
      this.ghost.set({ x: rect.left, y: rect.top });
      navigator.vibrate?.(15);
    }, 350);
  }

  protected onCardTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    const item = this.dragItem();
    if (!item) {
      // Moving before the hold completes is a scroll, not a drag.
      if (
        this.pressStart &&
        Math.hypot(touch.clientX - this.pressStart.x, touch.clientY - this.pressStart.y) > 10
      ) {
        this.clearPress();
      }
      return;
    }
    event.preventDefault();
    this.ghost.set({ x: touch.clientX - item.offsetX, y: touch.clientY - item.offsetY });
    if (touch.clientY < 140) {
      void this.content()?.scrollByPoint(0, -16, 0);
    } else if (touch.clientY > window.innerHeight - 140) {
      void this.content()?.scrollByPoint(0, 16, 0);
    }
    const element = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const fieldEl = element?.closest<HTMLElement>('[data-field-id]');
    if (!fieldEl || element?.closest('[data-drop-placeholder]')) {
      return;
    }
    const fieldId = fieldEl.dataset['fieldId']!;
    const slotEl = element?.closest<HTMLElement>('[data-slot-index]');
    let index = (this.boardSlots().get(fieldId) ?? []).length;
    if (slotEl) {
      const rect = slotEl.getBoundingClientRect();
      index =
        Number(slotEl.dataset['slotIndex']) + (touch.clientY > rect.top + rect.height / 2 ? 1 : 0);
    }
    const current = this.dropTarget();
    if (current?.fieldId !== fieldId || current.index !== index) {
      this.dropTarget.set({ fieldId, index });
    }
  }

  protected async onCardTouchEnd(): Promise<void> {
    this.clearPress();
    const item = this.dragItem();
    const target = this.dropTarget();
    this.dragItem.set(null);
    this.ghost.set(null);
    this.dropTarget.set(null);
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    if (!item || !target || !organizationId || !tournamentId) {
      return;
    }
    const index =
      item.fieldId === target.fieldId && item.index < target.index
        ? target.index - 1
        : target.index;
    if (item.fieldId === target.fieldId && index === item.index) {
      return;
    }
    this.errorMessage.set(null);
    try {
      await this.scheduleApi.move(organizationId, tournamentId, {
        timeSlotId: item.slotId,
        fieldId: target.fieldId,
        index,
      });
      await this.loadBoard();
    } catch (error) {
      this.errorMessage.set(this.boardApiMessage(error) ?? 'organizer.wizard.errorGeneric');
    }
  }

  private clearPress(): void {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  // Time the dragged card will start at, shown in the open space.
  protected readonly dropPreviewTime = computed(() => {
    const target = this.dropTarget();
    const item = this.dragItem();
    const dragged = this.draggedSlot();
    if (!target || !item || !dragged) {
      return null;
    }
    const lengthMs = new Date(dragged.endTime).getTime() - new Date(dragged.startTime).getTime();
    const draggedStart = new Date(dragged.startTime).getTime();
    const column = (this.boardSlots().get(target.fieldId) ?? [])
      .filter((slot) => slot.id !== dragged.id)
      .map((slot) => {
        const start = new Date(slot.startTime).getTime();
        const moved = item.fieldId === target.fieldId && start >= draggedStart;
        return {
          start: start - (moved ? lengthMs : 0),
          end: new Date(slot.endTime).getTime() - (moved ? lengthMs : 0),
        };
      });
    const index =
      item.fieldId === target.fieldId && item.index < target.index
        ? target.index - 1
        : target.index;
    const start =
      column.length === 0
        ? draggedStart
        : index < column.length
          ? column[index].start
          : column[column.length - 1].end;
    return this.boardClock(new Date(start).toISOString());
  });

  constructor() {
    // The board follows the calendar: loaded once one exists, refreshed after a regeneration.
    effect(() => {
      if (this.matches()) {
        void this.loadBoard();
      }
    });
    effect(() => {
      if (this.step() === 5 && this.isRepublish()) {
        void this.loadPublicationQuote();
      }
    });
    const organizationId = this.auth.organizations()[0]?.id;
    this.organizationId = organizationId ?? null;
    void this.publicApi.listSports().then((sports) => this.sports.set(sports));
    if (organizationId) {
      void this.organizationsApi
        .getSubscriptionStatus(organizationId)
        .then((status) => this.subscriptionStatus.set(status));
    }
    const editId = this.route.snapshot.paramMap.get('id');
    if (editId && organizationId) {
      this.mode.set('edit');
      this.tournamentId = editId;
      void this.loadForEdit(organizationId, editId);
    }
  }

  /** Edit-mode-only preload, run once from the constructor -- fetches everything the wizard's 5 steps need to prefill, in the same dependency order the create flow builds it up in (tournament -> category -> teams/structure -> calendar). A failure here is fatal to the whole page (nothing meaningful to show without it), unlike the per-step errorMessage() used everywhere else. */
  private async loadForEdit(organizationId: string, tournamentId: string): Promise<void> {
    this.initializing.set(true);
    try {
      const tournament = await this.tournamentsApi.getTournament(organizationId, tournamentId);
      this.name.set(tournament.name);
      this.sportId.set(tournament.sportId);
      this.isOnline.set(tournament.isOnline);
      this.isListed.set(tournament.isListed);
      this.theme.set(tournament.theme);
      this.organizerClubId.set(tournament.organizerClubId ?? '');
      this.organizerByClub.set(!!tournament.organizerClubId);
      this.currentStatus.set(tournament.status);
      if (tournament.startDate) {
        this.startDate.set(tournament.startDate.slice(0, 10));
      }
      this.loadedEndDate = tournament.endDate?.slice(0, 10) ?? null;
      // The existing venue, so Infos shows it and a rename is saved on it
      // (it used to be ignored once the tournament existed).
      const [venue] = await this.creationApi.listVenues(organizationId, tournamentId);
      if (venue) {
        this.existingVenue = venue;
        this.venueName.set(venue.name);
        this.venueAddress.set(venue.address);
      }
      this.headerBackgroundSaved = tournament.headerBackgroundUrl
        ? (headerBackgroundPresetOf(tournament.headerBackgroundUrl) ?? 'other')
        : null;
      this.headerBackgroundChoice.set(this.headerBackgroundSaved);

      const categories = await this.creationApi.listCategories(organizationId, tournamentId);
      const category = categories[0];
      if (!category) {
        // Created but abandoned before Infos ever finished (no category yet)
        // -- nothing further to preload, the rest of the wizard just runs
        // the normal create flow from here.
        return;
      }
      this.categoryId = category.id;

      const [teams, phases] = await Promise.all([
        this.teamsApi.listTeams(organizationId, tournamentId, category.id),
        this.creationApi.listPhases(organizationId, tournamentId, category.id),
      ]);
      this.teams.set(
        teams.map((team) => ({ id: team.id, name: team.name, logoUrl: team.logoUrl })),
      );

      const realPhases = phases.filter((phase) => !phase.isSeedPhase);
      if (realPhases.length === 0) {
        return;
      }
      this.structureSummary.set(this.summarizeStructure(realPhases));

      const groupPhase = realPhases.find((phase) => phase.type === 'GROUP_STAGE');
      if (!groupPhase) {
        return;
      }
      this.groupPhaseId = groupPhase.id;
      const matches = await this.creationApi.listMatches(
        organizationId,
        tournamentId,
        groupPhase.id,
      );
      if (matches.length > 0) {
        this.matches.set(matches);
        // Prefill the generation settings from the calendar that exists, so
        // "Régénérer" keeps its day, kickoff and fields unless changed.
        const starts = matches
          .map((match) => match.timeSlot?.startTime)
          .filter((start): start is string => !!start)
          .sort();
        if (starts[0]) {
          const first = new Date(starts[0]);
          this.scheduleDate.set(toIsoDate(first));
          this.scheduleTime.set(
            `${String(first.getHours()).padStart(2, '0')}:${String(first.getMinutes()).padStart(2, '0')}`,
          );
        }
        const fieldNames = new Set(matches.map((match) => match.timeSlot?.field.name));
        fieldNames.delete(undefined);
        this.fieldCount.set(String(Math.max(1, fieldNames.size)));
      }
    } catch {
      this.errorMessage.set('organizer.wizard.errorGeneric');
    } finally {
      this.initializing.set(false);
      // ?step=2 -- the quick plateau flow lands straight on Équipes to
      // rename its "Équipe N" placeholders.
      const step = Number(this.route.snapshot.queryParamMap.get('step'));
      if (step >= 1 && step <= 5) {
        this.step.set(step as 1 | 2 | 3 | 4 | 5);
      }
    }
  }

  /** One-line, best-effort description of an already-generated structure for the read-only Structure step -- not trying to reproduce the full admin-web Structure page, just enough context that "you already have one" reads as more than a bare fact. */
  private summarizeStructure(realPhases: OrganizerPhase[]): string {
    const groupStage = realPhases.find((phase) => phase.type === 'GROUP_STAGE');
    const hasKnockout = realPhases.some((phase) => phase.type === 'KNOCKOUT');
    const poolCount = groupStage?.groups.length ?? 0;
    const lang = this.transloco.getActiveLang();
    if (groupStage && hasKnockout) {
      return this.transloco.translate(
        'organizer.wizard.structure.summary.poolsKnockout',
        { count: poolCount },
        lang,
      );
    }
    if (groupStage) {
      return this.transloco.translate(
        'organizer.wizard.structure.summary.pools',
        { count: poolCount },
        lang,
      );
    }
    return this.transloco.translate('organizer.wizard.structure.summary.knockoutOnly', {}, lang);
  }

  /**
   * No native subscription-management UI yet -- opens the web app's own page
   * in the system browser, same pattern as the Stripe publication checkout
   * in submitPublish() below. Never called on iOS: the template hides this
   * button entirely there (isIosNative), so this early return is only a
   * defensive backstop, not the actual gate.
   */
  protected openSubscriptionManagement(): void {
    if (this.isIosNative) {
      return;
    }
    window.open(`${environment.webUrl}/admin/organization/subscription`, '_blank', 'noopener');
  }

  /**
   * iOS-only counterpart of openSubscriptionManagement above, for the one
   * action that *is* available natively: subscribing itself (App Review
   * guideline 3.1.1, same StoreKit-only posture as submitPublish()'s own
   * IAP branch). No PENDING_PAYMENT/checkoutUrl round-trip to start first
   * here -- unlike a tournament-tier purchase, there's no order to size
   * (subscription price is fixed), so this goes straight to StoreKit;
   * confirmSubscriptionPaymentViaIap resolves it against RevenueCat
   * server-side afterwards, same "never trust the client" posture.
   */
  protected async subscribeIos(): Promise<void> {
    const organizationId = this.organizationId;
    if (!organizationId || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.iap.purchase('annual_subscription');
    } catch (error) {
      this.submitting.set(false);
      if (error instanceof IapCancelledError) {
        // Organizer backed out of the native purchase sheet themselves --
        // a normal outcome, not an error, same as submitPublish()'s own
        // IapCancelledError handling.
        return;
      }
      this.errorMessage.set('organizer.wizard.publish.subscribeError');
      return;
    }
    try {
      const status = await this.organizationsApi.confirmSubscriptionPaymentViaIap(organizationId);
      this.subscriptionStatus.set(status);
    } catch {
      this.errorMessage.set('organizer.wizard.publish.subscribeError');
    } finally {
      this.submitting.set(false);
    }
  }

  protected onHeaderBackgroundFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file) {
      this.headerBackgroundFile.set(file);
      this.headerBackgroundChoice.set('other');
    }
  }

  /** Best-effort, same as the logo: a rejected upload (free tier) must not block the wizard. */
  private async saveHeaderBackground(organizationId: string, tournamentId: string): Promise<void> {
    const choice = this.headerBackgroundChoice();
    const file = this.headerBackgroundFile();
    try {
      if (choice === 'other' && file) {
        await this.tournamentsApi.uploadHeaderBackground(organizationId, tournamentId, file);
      } else if (choice && choice !== 'other' && choice !== this.headerBackgroundSaved) {
        await this.tournamentsApi.setHeaderBackgroundPreset(organizationId, tournamentId, choice);
      } else {
        return;
      }
      this.headerBackgroundSaved = choice;
      this.headerBackgroundFile.set(null);
    } catch {
      // Intentionally swallowed -- see comment above.
    }
  }

  protected onVenueInput(value: string): void {
    this.venueName.set(value);
    this.venueAddress.set(null);
    this.venueSearch.query(value);
  }

  protected onVenueSuggestionSelect(index: number): void {
    const suggestion = this.venueSearch.suggestions()[index];
    if (!suggestion) {
      return;
    }
    this.venueName.set(suggestion.name);
    this.venueAddress.set(suggestion.address);
    this.venueSearch.clear();
  }

  protected onLogoFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.logoFile.set(file);
  }

  /** Create mode just queues the name (committed later, see submitTeams()); edit mode creates it right away since there's no later "Suivant" that owns Équipes changes there. */
  protected toggleClubSearch(): void {
    const enabled = !this.useClubSearch();
    this.useClubSearch.set(enabled);
    this.clubSearch.clear();
    try {
      localStorage.setItem(CLUB_SEARCH_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  }

  protected onTeamInput(value: string): void {
    this.teamInput.set(value);
    this.teamClubId.set('');
    this.teamClubLogo.set(null);
    if (this.useClubSearch() && this.clubSearchAvailable()) {
      this.clubSearch.query(value);
    }
  }

  protected onClubSelect(index: number): void {
    const club = this.clubSearch.suggestions()[index];
    if (!club) {
      return;
    }
    this.teamInput.set(club.name);
    this.teamClubId.set(club.externalId);
    this.teamClubLogo.set(club.logoUrl);
    this.clubSearch.clear();
  }

  protected toggleOrganizerByClub(): void {
    this.organizerByClub.update((value) => !value);
  }

  protected onOrganizerClubInput(value: string): void {
    this.organizerClubQuery.set(value);
    this.organizerClubSearch.query(value);
  }

  protected onOrganizerClubSelect(index: number): void {
    const club = this.organizerClubSearch.suggestions()[index];
    if (!club) {
      return;
    }
    this.organizerClubId.set(club.externalId);
    this.organizerClubLabel.set(club.name);
    this.organizerClubQuery.set('');
    this.organizerClubSearch.clear();
  }

  protected unlinkOrganizerClub(): void {
    this.organizerClubId.set('');
    this.organizerClubLabel.set('');
  }

  // Only while the box is ticked and the club is of the chosen sport
  // (the sport may have changed since it was picked).
  private organizerClubToSave(): string {
    const id = this.organizerClubId();
    const sport = this.clubSport();
    if (!this.organizerByClub() || !id || !sport) {
      return '';
    }
    const idSport = id.startsWith('fff:') ? 'football' : id.split(':')[1];
    return idSport === sport ? id : '';
  }

  private clubLocation(club: ClubSuggestion): string {
    const place = [club.postalCode, club.city].filter(Boolean).join(' ');
    if (place) {
      return place;
    }
    return club.department
      ? this.transloco.translate('organizer.wizard.teams.club.department', {
          code: club.department,
        })
      : '';
  }

  protected async addTeam(): Promise<void> {
    const name = this.teamInput().trim();
    if (!name || this.submitting()) {
      return;
    }
    const externalClubId = this.teamClubId() || null;
    if (this.mode() === 'create') {
      const logoUrl = this.teamClubLogo();
      this.teams.update((teams) => [...teams, { id: null, name, externalClubId, logoUrl }]);
      this.resetTeamInput();
      return;
    }
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const categoryId = this.categoryId;
    if (!organizationId || !tournamentId || !categoryId) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const team = await this.teamsApi.createTeam(organizationId, tournamentId, {
        name,
        categoryId,
        externalClubId: externalClubId ?? undefined,
      });
      this.teams.update((teams) => [
        ...teams,
        { id: team.id, name: team.name, externalClubId, logoUrl: team.logoUrl },
      ]);
      this.resetTeamInput();
    } catch {
      this.errorMessage.set('organizer.wizard.teams.errorAdd');
    } finally {
      this.submitting.set(false);
    }
  }

  protected readonly pastedNames = signal('');
  protected readonly placeholderCount = computed(
    () => this.teams().filter((team) => isPlaceholderTeamName(team.name)).length,
  );

  /**
   * One club per line (or comma separated). Edit mode renames the quick
   * plateau's "Équipe N" placeholders first, in order, then adds whatever
   * names are left as new teams; create mode just queues them all, same as
   * typing them one by one.
   */
  protected async applyPastedNames(): Promise<void> {
    const names = this.pastedNames()
      .split(/[\n;,]/)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (names.length === 0 || this.submitting()) {
      return;
    }
    if (this.mode() === 'create') {
      this.teams.update((teams) => [...teams, ...names.map((name) => ({ id: null, name }))]);
      this.pastedNames.set('');
      return;
    }
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const categoryId = this.categoryId;
    if (!organizationId || !tournamentId || !categoryId) {
      return;
    }
    const renames = assignPastedNames(
      this.teams().filter((team): team is { id: string; name: string } => team.id !== null),
      names.join('\n'),
    );
    const placeholders = this.placeholderCount();
    const renamed = [...renames].slice(0, placeholders);
    const extra = names.slice(renamed.length);
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      for (const [teamId, name] of renamed) {
        await this.teamsApi.renameTeam(organizationId, tournamentId, teamId, name);
        this.teams.update((teams) =>
          teams.map((team) => (team.id === teamId ? { ...team, name } : team)),
        );
      }
      // The Calendrier step's cards were preloaded with the old names.
      const newNames = new Map(renamed);
      const rename = <T extends { id: string; name: string } | null>(team: T): T =>
        team && newNames.has(team.id) ? { ...team, name: newNames.get(team.id)! } : team;
      this.matches.update(
        (matches) =>
          matches?.map((match) => ({
            ...match,
            homeTeam: rename(match.homeTeam),
            awayTeam: rename(match.awayTeam),
          })) ?? null,
      );
      for (const name of extra) {
        const team = await this.teamsApi.createTeam(organizationId, tournamentId, {
          name,
          categoryId,
        });
        this.teams.update((teams) => [
          ...teams,
          { id: team.id, name: team.name, logoUrl: team.logoUrl },
        ]);
      }
      this.pastedNames.set('');
    } catch {
      this.errorMessage.set('organizer.wizard.teams.errorPaste');
    } finally {
      this.submitting.set(false);
    }
  }

  private resetTeamInput(): void {
    this.teamInput.set('');
    this.teamClubId.set('');
    this.teamClubLogo.set(null);
    this.clubSearch.clear();
  }

  protected startEditTeam(index: number): void {
    const team = this.teams()[index];
    if (!team || this.submitting()) {
      return;
    }
    this.editingTeamIndex.set(index);
    this.editTeamName.set(team.name);
  }

  protected cancelEditTeam(): void {
    this.editingTeamIndex.set(null);
    this.editTeamName.set('');
  }

  /**
   * Renames the row being edited -- locally in create mode (the queue is only
   * sent at "Suivant"), through the API in edit mode. The club link and its
   * logo stay: "ET.S Milloise U13" is still that club.
   */
  protected async saveEditTeam(): Promise<void> {
    const index = this.editingTeamIndex();
    const team = index === null ? undefined : this.teams()[index];
    const name = this.editTeamName().trim();
    if (index === null || !team || this.submitting()) {
      return;
    }
    if (!name || name === team.name) {
      this.cancelEditTeam();
      return;
    }
    if (this.mode() === 'edit' && team.id) {
      const organizationId = this.organizationId;
      const tournamentId = this.tournamentId;
      if (!organizationId || !tournamentId) {
        return;
      }
      this.submitting.set(true);
      this.errorMessage.set(null);
      try {
        await this.teamsApi.renameTeam(organizationId, tournamentId, team.id, name);
      } catch {
        this.errorMessage.set('organizer.wizard.teams.errorRename');
        return;
      } finally {
        this.submitting.set(false);
      }
      // The Calendrier step's cards were preloaded with the old name.
      const teamId = team.id;
      const rename = <T extends { id: string; name: string } | null>(t: T): T =>
        t && t.id === teamId ? { ...t, name } : t;
      this.matches.update(
        (matches) =>
          matches?.map((match) => ({
            ...match,
            homeTeam: rename(match.homeTeam),
            awayTeam: rename(match.awayTeam),
          })) ?? null,
      );
    }
    this.teams.update((teams) => teams.map((t, i) => (i === index ? { ...t, name } : t)));
    this.cancelEditTeam();
  }

  /** Create mode just drops it from the local queue (never existed server-side yet); edit mode deletes the real team. */
  protected async removeTeam(index: number): Promise<void> {
    const team = this.teams()[index];
    if (!team || this.submitting()) {
      return;
    }
    if (this.mode() === 'edit' && team.id) {
      const organizationId = this.organizationId;
      const tournamentId = this.tournamentId;
      if (!organizationId || !tournamentId) {
        return;
      }
      this.submitting.set(true);
      this.errorMessage.set(null);
      try {
        await this.teamsApi.removeTeam(organizationId, tournamentId, team.id);
      } catch {
        this.errorMessage.set('organizer.wizard.teams.errorRemove');
        return;
      } finally {
        this.submitting.set(false);
      }
    }
    this.teams.update((teams) => teams.filter((_, i) => i !== index));
    this.cancelEditTeam();
  }

  protected selectFormat(format: WizardStructureFormat): void {
    this.format.set(format);
  }

  protected selectVisibility(listed: boolean): void {
    this.isListed.set(listed);
  }

  protected canAdvance(): boolean {
    switch (this.step()) {
      case 1:
        return this.name().trim().length > 0 && this.sportId() !== '' && this.startDate() !== '';
      case 2:
        // The "≥3 teams" nudge only makes sense while building a tournament
        // from scratch -- an existing one may legitimately have any team
        // count already (or the organizer may just be here to remove one).
        return this.mode() === 'edit' || this.teams().length >= 3;
      default:
        return true;
    }
  }

  /** Edit mode only -- all data is already loaded, so the rail can jump straight to any step instead of forcing the linear create-mode walk. n is a plain number here (the rail's own [1,2,3,4,5] template array, same as stepNumber's own comment on why the rail stays untyped as WizardStep) rather than the narrower WizardStep union. */
  protected goToStep(n: number): void {
    if (this.mode() !== 'edit' || this.submitting() || this.initializing()) {
      return;
    }
    this.step.set(n as 1 | 2 | 3 | 4 | 5);
  }

  protected async prevStep(): Promise<void> {
    const current = this.step();
    if (current === 'done') {
      return;
    }
    if (current === 1) {
      await this.backToList();
      return;
    }
    this.step.set((current - 1) as 1 | 2 | 3 | 4);
  }

  protected async nextStep(): Promise<void> {
    const current = this.step();
    if (current === 'done' || !this.canAdvance() || this.submitting()) {
      return;
    }
    this.errorMessage.set(null);
    this.errorDetail.set(null);
    this.submitting.set(true);
    try {
      if (current === 1) {
        await this.submitInfos();
      } else if (current === 2 && this.mode() === 'create') {
        // Edit mode: Équipes already commits every add/remove immediately
        // (see addTeam()/removeTeam()), nothing left to do here.
        await this.submitTeams();
      } else if (current === 3 && !this.structureSummary()) {
        // Edit mode with a structure already generated: read-only summary,
        // nothing to submit (see the template's own guard).
        await this.submitStructure();
      } else if (current === 5) {
        // Already published (edit mode): this is "Republier" -- same
        // publish() call, which charges only if the changes need it.
        this.republished.set(this.isRepublish());
        await this.submitPublish();
        return;
      }
      this.step.set((current + 1) as 2 | 3 | 4 | 5);
    } catch (error) {
      if (error instanceof PublishStageError) {
        this.errorMessage.set(error.key);
        this.errorDetail.set(describeError(error.origin) || null);
      } else {
        this.errorMessage.set('organizer.wizard.errorGeneric');
      }
    } finally {
      this.submitting.set(false);
    }
  }

  private async submitInfos(): Promise<void> {
    const organizationId = this.organizationId;
    if (!organizationId) {
      throw new Error('No organization');
    }
    if (this.mode() === 'edit') {
      await this.submitInfosEdit(organizationId);
      return;
    }
    // theme is intentionally NOT sent here -- apps/api rejects a non-default
    // theme at creation time for tournaments that aren't past the free
    // tier yet (team count, or an active subscription -- see
    // PremiumFeaturesStatus), with an error that literally says "create
    // with the default theme first, then customize". Applied as a
    // best-effort follow-up PATCH below instead, same pattern as the logo
    // upload right after it: a rejected customization shouldn't block
    // tournament creation over a color choice.
    const tournament = await this.tournamentsApi.createTournament(organizationId, {
      name: this.name().trim(),
      sportId: this.sportId(),
      isOnline: this.isOnline(),
      startDate: this.startDate(),
      organizerClubId: this.organizerClubToSave() || undefined,
    });
    this.tournamentId = tournament.id;
    this.scheduleDate.set(this.startDate());
    if (this.theme() !== DEFAULT_THEME) {
      try {
        await this.tournamentsApi.updateTournament(organizationId, tournament.id, {
          theme: this.theme(),
        });
      } catch {
        this.theme.set(DEFAULT_THEME);
      }
    }
    const category = await this.creationApi.createCategory(
      organizationId,
      tournament.id,
      tournament.sportName,
    );
    this.categoryId = category.id;
    const logo = this.logoFile();
    if (logo) {
      // Best-effort -- a rejected upload (e.g. free-tier gate, see
      // PremiumFeaturesStatus) shouldn't block the wizard from continuing.
      try {
        await this.tournamentsApi.uploadLogo(organizationId, tournament.id, logo);
      } catch {
        // Intentionally swallowed -- see comment above.
      }
    }
    await this.saveHeaderBackground(organizationId, tournament.id);
  }

  /** Edit mode's Infos step -- PATCH instead of POST, no category to (re-)create, logo upload replaces the existing one (already idempotent server-side). */
  private async submitInfosEdit(organizationId: string): Promise<void> {
    const tournamentId = this.tournamentId;
    if (!tournamentId) {
      throw new Error('Wizard state not initialized');
    }
    const startDate = this.startDate();
    await this.tournamentsApi.updateTournament(organizationId, tournamentId, {
      name: this.name().trim(),
      sportId: this.sportId(),
      isOnline: this.isOnline(),
      startDate,
      organizerClubId: this.organizerClubToSave(),
      ...(this.loadedEndDate && this.loadedEndDate < startDate ? { endDate: startDate } : {}),
    });
    const venue = this.existingVenue;
    const venueName = this.venueName().trim();
    const venueAddress = this.venueAddress();
    if (
      venue &&
      !this.isOnline() &&
      venueName &&
      (venueName !== venue.name || (venueAddress && venueAddress !== venue.address))
    ) {
      await this.creationApi.updateVenue(organizationId, tournamentId, venue.id, {
        name: venueName,
        ...(venueAddress && { address: venueAddress }),
      });
      this.existingVenue = { ...venue, name: venueName, address: venueAddress ?? venue.address };
    }
    // Sent separately from the core fields above -- a theme change can be
    // rejected on its own (still free tier, see PremiumFeaturesStatus), and
    // that shouldn't take a plain rename/sport change down with it.
    try {
      await this.tournamentsApi.updateTournament(organizationId, tournamentId, {
        theme: this.theme(),
      });
    } catch {
      // Best-effort, same reasoning as the create-mode path.
    }
    const logo = this.logoFile();
    if (logo) {
      try {
        await this.tournamentsApi.uploadLogo(organizationId, tournamentId, logo);
      } catch {
        // Best-effort, same reasoning as the create-mode path above.
      }
    }
    await this.saveHeaderBackground(organizationId, tournamentId);
  }

  private async submitTeams(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const categoryId = this.categoryId;
    if (!organizationId || !tournamentId || !categoryId) {
      throw new Error('Wizard state not initialized');
    }
    for (const team of this.teams()) {
      await this.teamsApi.createTeam(organizationId, tournamentId, {
        name: team.name,
        categoryId,
        externalClubId: team.externalClubId ?? undefined,
      });
    }
  }

  private async submitStructure(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const categoryId = this.categoryId;
    if (!organizationId || !tournamentId || !categoryId) {
      throw new Error('Wizard state not initialized');
    }
    const result = await this.creationApi.createStructurePreset(
      organizationId,
      tournamentId,
      categoryId,
      {
        format: this.format(),
        teamCount: this.teams().length,
        poolCount: Number(this.poolCount()) || 1,
        qualifiersPerPool: Number(this.qualifiersPerPool()) || 1,
      },
    );
    this.groupPhaseId = result.groupPhaseId;
  }

  /** Manual trigger (step 4's own button, mirrors the mockup) rather than folded into nextStep() -- generating a calendar is itself the meaningful action on this step, "Suivant" only confirms it's done. */
  protected async generateSchedule(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const groupPhaseId = this.groupPhaseId;
    if (!organizationId || !tournamentId || !groupPhaseId || this.generatingSchedule()) {
      return;
    }
    this.generatingSchedule.set(true);
    this.errorMessage.set(null);
    try {
      const fieldIds = await this.creationApi.ensureFields(
        organizationId,
        tournamentId,
        this.isOnline() ? 'En ligne' : this.venueName().trim() || 'Lieu principal',
        Math.max(1, Number.parseInt(this.fieldCount(), 10) || 1),
        this.isOnline() ? null : this.venueAddress(),
      );
      // Local date + time, so the kickoff is in the organizer's timezone.
      const start = new Date(`${this.scheduleDate()}T${this.scheduleTime() || '09:00'}`);
      const matchDuration = Number.parseInt(this.matchDurationMinutes(), 10);
      const breakDuration = Number.parseInt(this.breakDurationMinutes(), 10);
      const matches = await this.creationApi.generateSchedule(
        organizationId,
        tournamentId,
        groupPhaseId,
        {
          fieldIds,
          startDateTime: start.toISOString(),
          ...(matchDuration > 0 && { matchDurationMinutes: matchDuration }),
          ...(breakDuration >= 0 && { breakDurationMinutes: breakDuration }),
        },
      );
      this.matches.set(matches);
    } catch {
      this.errorMessage.set('organizer.wizard.calendar.errorGeneric');
    } finally {
      this.generatingSchedule.set(false);
    }
  }

  /** "On a 5 minutes de retard": moves every not-yet-played pool match. */
  protected async shiftSchedule(minutes: number): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const groupPhaseId = this.groupPhaseId;
    if (!organizationId || !tournamentId || !groupPhaseId || this.shiftingSchedule()) {
      return;
    }
    this.shiftingSchedule.set(true);
    this.errorMessage.set(null);
    try {
      this.matches.set(
        await this.creationApi.shiftSchedule(organizationId, tournamentId, groupPhaseId, minutes),
      );
    } catch {
      this.errorMessage.set('organizer.wizard.calendar.shiftError');
    } finally {
      this.shiftingSchedule.set(false);
    }
  }

  /** Format doesn't create a pool phase to schedule (KNOCKOUT_ONLY) -- see tournament-creation.service.ts's comment on generateSchedule(). In edit mode format() may still be its unused default (the format picker never ran), so this checks the real preloaded groupPhaseId instead. */
  protected readonly hasSchedulableStructure = (): boolean =>
    this.mode() === 'edit' ? this.groupPhaseId !== null : this.format() !== 'knockout-only';

  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url ?? null);
  }

  /**
   * "Poules · Tour N" header for a Calendrier-step match card, matching
   * apps/web's admin schedule.page.ts#roundDisplay -- deliberately simpler
   * than that method since this step only ever generates GROUP_STAGE
   * matches (see hasSchedulableStructure's own comment: KNOCKOUT_ONLY skips
   * this step entirely, and pools always precede any bracket in the other
   * two formats), so there's no knockout-round-name branch to handle and no
   * need to fetch the real phase/group entity just to read its type.
   * Reuses organizer.scores.poolsOption's "Poules" rather than adding a new
   * key for the same word.
   */
  protected matchHeaderLabel(match: MatchSummary): string {
    const lang = this.transloco.getActiveLang();
    const poolsLabel = this.transloco.translate('organizer.scores.poolsOption', {}, lang);
    const roundLabel = matchRoundLabel(
      { type: 'GROUP_STAGE', knockoutBracket: null },
      { round: match.round, isThirdPlaceMatch: false },
      'compact',
      lang as Parameters<typeof matchRoundLabel>[3],
    );
    return `${poolsLabel} · ${roundLabel}`;
  }

  private async submitPublish(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    if (!organizationId || !tournamentId) {
      throw new Error('Wizard state not initialized');
    }
    try {
      await this.tournamentsApi.updateTournament(organizationId, tournamentId, {
        isListed: this.isListed(),
      });
    } catch (error) {
      throw new PublishStageError('organizer.wizard.publish.errorVisibility', error);
    }
    let result;
    try {
      result = await this.tournamentsApi.publish(organizationId, tournamentId);
    } catch (error) {
      throw new PublishStageError('organizer.wizard.publish.errorCheckout', error);
    }
    if (result.status === 'PENDING_PAYMENT') {
      if (this.isIosNative) {
        if (result.iapProductId) {
          // Real StoreKit purchase (App Review guideline 3.1.1) -- buy the
          // matching product via RevenueCat, then confirm it server-side.
          // The purchase call succeeding is never enough on its own: the
          // backend independently re-verifies against RevenueCat's own
          // records before actually publishing (same "never trust the
          // client" posture Stripe's own confirm/webhook pair already had).
          try {
            await this.iap.purchase(result.iapProductId);
          } catch (error) {
            if (error instanceof IapCancelledError) {
              // Organizer backed out of the native purchase sheet
              // themselves -- a normal outcome, not an error. Stay on the
              // Publication step exactly as it was; no 'done' navigation.
              return;
            }
            throw new PublishStageError(
              error instanceof Error && error.message.startsWith('IAP product not found')
                ? 'organizer.wizard.publish.errorProduct'
                : 'organizer.wizard.publish.errorPurchase',
              error,
            );
          }
          let published;
          try {
            published = await this.tournamentsApi.confirmPublicationPaymentViaIap(
              organizationId,
              tournamentId,
              result.iapProductId,
            );
          } catch (error) {
            throw new PublishStageError('organizer.wizard.publish.errorConfirm', error);
          }
          this.publishedTournamentName.set(published.name);
        } else {
          // No IAP product matches this exact amount (e.g. tier prices are
          // unset/0 in this environment) -- same fallback as before: the
          // 'done' step tells the organizer in plain, non-actionable text
          // to finish this from a browser on the web.
          this.paymentBlockedOnIos.set(true);
        }
      } else {
        // No deep-linking back into this app from Stripe's hosted checkout
        // (same limitation as PR 1's email verification link) -- opened in a
        // new tab/system browser so this app's own state survives, and the
        // 'done' step's copy says explicitly to finish payment there and
        // check back later rather than implying it happens automatically.
        window.open(result.checkoutUrl, '_blank', 'noopener');
        this.checkoutOpened.set(true);
      }
    } else {
      this.publishedTournamentName.set(result.name);
    }
    this.step.set('done');
  }

  /** Edit mode only, Publication step's footer action when currentStatus() is PUBLISHED -- doesn't route through the 'done' confirmation screen (its copy assumes a fresh publish) since the updated status badge on this same step already is the confirmation. */
  private async submitUnpublish(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    if (!organizationId || !tournamentId) {
      throw new Error('Wizard state not initialized');
    }
    const tournament = await this.tournamentsApi.unpublish(organizationId, tournamentId);
    this.currentStatus.set(tournament.status);
  }

  private async loadPublicationQuote(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    if (!organizationId || !tournamentId) {
      return;
    }
    this.publicationQuote.set(null);
    try {
      this.publicationQuote.set(
        await this.tournamentsApi.getPublicationQuote(organizationId, tournamentId),
      );
    } catch {
      // Best-effort hint only -- publish() itself still charges correctly.
    }
  }

  protected formatAmount(quote: PublicationQuote): string {
    return new Intl.NumberFormat(this.transloco.getActiveLang(), {
      style: 'currency',
      currency: quote.currency.toUpperCase(),
    }).format(quote.amountCents / 100);
  }

  /** Publication step, already-published tournament: secondary action next to "Republier". */
  /** Archive (close) or bring back the tournament -- the status block of the Publication step. */
  protected async setArchived(archived: boolean): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    if (!organizationId || !tournamentId || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const tournament = archived
        ? await this.tournamentsApi.archive(organizationId, tournamentId)
        : await this.tournamentsApi.unarchive(organizationId, tournamentId);
      this.currentStatus.set(tournament.status);
    } catch {
      this.errorMessage.set('organizer.wizard.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }

  /** The app's own Structure screen (pools, brackets, pairings). */
  protected async openStructure(): Promise<void> {
    if (this.tournamentId) {
      await this.router.navigateByUrl(`/organizer/tournaments/${this.tournamentId}/structure`);
    }
  }

  protected async unpublish(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      await this.submitUnpublish();
    } catch {
      this.errorMessage.set('organizer.wizard.errorGeneric');
    } finally {
      this.submitting.set(false);
    }
  }

  /** Publication step's footer button label -- "Payer et publier" only makes sense for a genuine first publish; edit mode relabels it to match what the tap will actually do. */
  protected footerNextLabel(): string {
    if (this.step() !== 5) {
      return 'organizer.wizard.next';
    }
    if (this.mode() === 'edit') {
      if (this.currentStatus() === 'PUBLISHED') {
        return (this.publicationQuote()?.amountCents ?? 0) > 0
          ? 'organizer.wizard.publish.payAndRepublish'
          : 'organizer.wizard.publish.republish';
      }
      if (this.currentStatus() === 'UNPUBLISHED') {
        return 'organizer.wizard.publish.republish';
      }
    }
    return 'organizer.wizard.payAndPublish';
  }

  // navigateRoot, not a plain forward navigation: Ionic keeps this page
  // alive in its stack otherwise, and reopening the same tournament from
  // the list then landed back on the stale 'done' screen instead of a
  // fresh wizard (only a page refresh got out of it).
  protected async backToList(): Promise<void> {
    await this.navController.navigateRoot('/organizer/tournaments', { animationDirection: 'back' });
  }
}

function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Default day for a new calendar -- same "tomorrow" the wizard always used. */
function tomorrowIsoDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toIsoDate(date);
}
