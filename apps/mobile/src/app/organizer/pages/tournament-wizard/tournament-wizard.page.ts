import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, TextField } from 'design-system';
import { PublicSport, PublicTheme, matchRoundLabel } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { IapCancelledError, IapService } from '../../core/iap.service';
import { OrganizerPhase, TournamentStatus, WizardStructureFormat } from '../../core/models';
import {
  OrganizationSubscriptionStatus,
  OrganizerOrganizationsService,
} from '../../core/organizations.service';
import { MatchSummary, TournamentCreationService } from '../../core/tournament-creation.service';
import { OrganizerTeamsService } from '../../core/teams.service';
import { OrganizerTournamentsService } from '../../core/tournaments.service';
import { environment } from '../../../../environments/environment';
import { isIosNative } from '../../../core/native-platform.util';

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
@Component({
  selector: 'app-organizer-tournament-wizard-page',
  imports: [
    Button,
    DatePipe,
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
  private readonly organizationsApi = inject(OrganizerOrganizationsService);
  private readonly publicApi = inject(PublicApiService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly iap = inject(IapService);
  private readonly transloco = inject(TranslocoService);
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

  // ---- Step 1: Infos ----
  protected readonly sports = signal<PublicSport[]>([]);
  protected readonly name = signal('');
  protected readonly sportId = signal('');
  protected readonly isOnline = signal(false);
  protected readonly venueName = signal('');
  protected readonly theme = signal<PublicTheme>(DEFAULT_THEME);
  protected readonly themes: PublicTheme[] = [
    'INK_SIGNAL',
    'PULSE_EMBER',
    'NEON_COURT',
    'FRESH_PITCH',
    'CRIMSON_CHARGE',
  ];
  protected readonly logoFile = signal<File | null>(null);

  private tournamentId: string | null = null;
  private organizationId: string | null = null;
  private categoryId: string | null = null;

  // ---- Step 2: Équipes ----
  protected readonly teamInput = signal('');
  // id is null for a create-mode entry not yet committed to the API (see
  // submitTeams(), still batched at "Suivant" there) and always set in edit
  // mode, where add/remove act immediately -- see addTeam()/removeTeam().
  protected readonly teams = signal<{ id: string | null; name: string }[]>([]);

  // ---- Step 3: Structure ----
  protected readonly format = signal<WizardStructureFormat>('pools-knockout');
  protected readonly poolCount = signal('4');
  protected readonly qualifiersPerPool = signal('2');

  // ---- Step 4: Calendrier ----
  protected readonly matches = signal<MatchSummary[] | null>(null);
  protected readonly generatingSchedule = signal(false);
  private groupPhaseId: string | null = null;

  // ---- Step 5: Publication ----
  protected readonly isListed = signal(true);
  protected readonly checkoutOpened = signal(false);
  // Set instead of checkoutOpened when submitPublish() hits PENDING_PAYMENT
  // on the native iOS build -- see isIosNative's own comment (App Review
  // guideline 3.1.1, no in-app purchase flow other than IAP on iOS).
  protected readonly paymentBlockedOnIos = signal(false);
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

  constructor() {
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
      this.currentStatus.set(tournament.status);

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
      this.teams.set(teams.map((team) => ({ id: team.id, name: team.name })));

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
      }
    } catch {
      this.errorMessage.set('organizer.wizard.errorGeneric');
    } finally {
      this.initializing.set(false);
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

  protected onLogoFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.logoFile.set(file);
  }

  /** Create mode just queues the name (committed later, see submitTeams()); edit mode creates it right away since there's no later "Suivant" that owns Équipes changes there. */
  protected async addTeam(): Promise<void> {
    const name = this.teamInput().trim();
    if (!name || this.submitting()) {
      return;
    }
    if (this.mode() === 'create') {
      this.teams.update((teams) => [...teams, { id: null, name }]);
      this.teamInput.set('');
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
      });
      this.teams.update((teams) => [...teams, { id: team.id, name: team.name }]);
      this.teamInput.set('');
    } catch {
      this.errorMessage.set('organizer.wizard.teams.errorAdd');
    } finally {
      this.submitting.set(false);
    }
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
        return this.name().trim().length > 0 && this.sportId() !== '';
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
      await this.router.navigateByUrl('/organizer/tournaments');
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
        if (this.mode() === 'edit' && this.currentStatus() === 'PUBLISHED') {
          await this.submitUnpublish();
        } else {
          await this.submitPublish();
        }
        return;
      }
      this.step.set((current + 1) as 2 | 3 | 4 | 5);
    } catch {
      this.errorMessage.set('organizer.wizard.errorGeneric');
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
    });
    this.tournamentId = tournament.id;
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
  }

  /** Edit mode's Infos step -- PATCH instead of POST, no category to (re-)create, logo upload replaces the existing one (already idempotent server-side). */
  private async submitInfosEdit(organizationId: string): Promise<void> {
    const tournamentId = this.tournamentId;
    if (!tournamentId) {
      throw new Error('Wizard state not initialized');
    }
    await this.tournamentsApi.updateTournament(organizationId, tournamentId, {
      name: this.name().trim(),
      sportId: this.sportId(),
      isOnline: this.isOnline(),
    });
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
      const fieldId = await this.creationApi.createDefaultVenueField(
        organizationId,
        tournamentId,
        this.isOnline() ? 'En ligne' : this.venueName().trim() || 'Lieu principal',
      );
      // Starts tomorrow at 9:00 local time -- a placeholder the organizer
      // can adjust later from the real match-management pages (out of this
      // wizard's scope, see tournament-creation.service.ts's own comment).
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(9, 0, 0, 0);
      const matches = await this.creationApi.generateSchedule(
        organizationId,
        tournamentId,
        groupPhaseId,
        fieldId,
        start.toISOString(),
      );
      this.matches.set(matches);
    } catch {
      this.errorMessage.set('organizer.wizard.calendar.errorGeneric');
    } finally {
      this.generatingSchedule.set(false);
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
    await this.tournamentsApi.updateTournament(organizationId, tournamentId, {
      isListed: this.isListed(),
    });
    const result = await this.tournamentsApi.publish(organizationId, tournamentId);
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
            throw error;
          }
          const published = await this.tournamentsApi.confirmPublicationPaymentViaIap(
            organizationId,
            tournamentId,
            result.iapProductId,
          );
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

  /** Publication step's footer button label -- "Payer et publier" only makes sense for a genuine first publish; edit mode relabels it to match what the tap will actually do. */
  protected footerNextLabel(): string {
    if (this.step() !== 5) {
      return 'organizer.wizard.next';
    }
    if (this.mode() === 'edit') {
      if (this.currentStatus() === 'PUBLISHED') {
        return 'organizer.wizard.publish.unpublish';
      }
      if (this.currentStatus() === 'UNPUBLISHED') {
        return 'organizer.wizard.publish.republish';
      }
    }
    return 'organizer.wizard.payAndPublish';
  }

  protected async backToList(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }
}
