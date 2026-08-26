import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonFooter, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, TextField } from 'design-system';
import { PublicSport, PublicTheme } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { WizardStructureFormat } from '../../core/models';
import {
  OrganizationSubscriptionStatus,
  OrganizerOrganizationsService,
} from '../../core/organizations.service';
import { MatchSummary, TournamentCreationService } from '../../core/tournament-creation.service';
import { OrganizerTeamsService } from '../../core/teams.service';
import { OrganizerTournamentsService } from '../../core/tournaments.service';
import { environment } from '../../../../environments/environment';

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
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

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
  protected readonly teams = signal<string[]>([]);

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
  protected readonly publishedTournamentName = signal('');
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
  }

  /** No native subscription-management UI yet -- opens the web app's own page in the system browser, same pattern as the Stripe publication checkout in submitPublish() below. */
  protected openSubscriptionManagement(): void {
    window.open(`${environment.webUrl}/admin/organization/subscription`, '_blank', 'noopener');
  }

  protected onLogoFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.logoFile.set(file);
  }

  protected addTeam(): void {
    const name = this.teamInput().trim();
    if (!name) {
      return;
    }
    this.teams.update((teams) => [...teams, name]);
    this.teamInput.set('');
  }

  protected removeTeam(index: number): void {
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
        return this.teams().length >= 3;
      default:
        return true;
    }
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
      } else if (current === 2) {
        await this.submitTeams();
      } else if (current === 3) {
        await this.submitStructure();
      } else if (current === 5) {
        await this.submitPublish();
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

  private async submitTeams(): Promise<void> {
    const organizationId = this.organizationId;
    const tournamentId = this.tournamentId;
    const categoryId = this.categoryId;
    if (!organizationId || !tournamentId || !categoryId) {
      throw new Error('Wizard state not initialized');
    }
    for (const name of this.teams()) {
      await this.teamsApi.createTeam(organizationId, tournamentId, { name, categoryId });
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

  /** Format doesn't create a pool phase to schedule (KNOCKOUT_ONLY) -- see tournament-creation.service.ts's comment on generateSchedule(). */
  protected readonly hasSchedulableStructure = () => this.format() !== 'knockout-only';

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
      // No deep-linking back into this app from Stripe's hosted checkout
      // (same limitation as PR 1's email verification link) -- opened in a
      // new tab/system browser so this app's own state survives, and the
      // 'done' step's copy says explicitly to finish payment there and
      // check back later rather than implying it happens automatically.
      window.open(result.checkoutUrl, '_blank', 'noopener');
      this.checkoutOpened.set(true);
    } else {
      this.publishedTournamentName.set(result.name);
    }
    this.step.set('done');
  }

  protected async backToList(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }
}
