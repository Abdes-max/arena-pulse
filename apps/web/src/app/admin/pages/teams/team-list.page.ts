import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { LanguageService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import { Category, Player, Team, TeamImportResult } from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';
import { TeamsService } from '../../core/teams.service';
import { TournamentsService } from '../../core/tournaments.service';

type PublicationTierCode = 'FREE' | 'STANDARD' | 'LARGE';

// Mirrors the structured body TournamentsService.assertTeamAdditionAllowed
// (apps/api) throws (403, code PUBLICATION_TIER_EXCEEDED) -- enough for this
// page to render the upsell dialog itself, no extra round-trip needed.
interface PublicationTierExceededError {
  code: 'PUBLICATION_TIER_EXCEEDED';
  currentTier: PublicationTierCode;
  requiredTier: PublicationTierCode;
  upgradeAmountCents: number;
  currency: string;
}

function isPublicationTierExceededError(
  error: unknown,
): error is HttpErrorResponse & { error: PublicationTierExceededError } {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 403 &&
    (error.error as { code?: unknown } | null)?.code === 'PUBLICATION_TIER_EXCEEDED'
  );
}

@Component({
  selector: 'app-team-list-page',
  imports: [Button, Select, TextField, TranslocoPipe],
  templateUrl: './team-list.page.html',
  styleUrl: './team-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly teamsService = inject(TeamsService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly teams = signal<Team[]>([]);

  // "You're on the Découverte plan" upsell dialog (see
  // isPublicationTierExceededError above) -- replaces a plain error banner
  // when adding a team is blocked because it would cross this already-
  // published tournament's paid tier.
  protected readonly tierExceededModal = signal<PublicationTierExceededError | null>(null);
  protected readonly tierUpgradeError = signal<string | null>(null);
  protected readonly tierUpgrading = signal(false);

  // Team logos are a premium touch (see
  // TournamentsService.assertPremiumFeaturesUnlocked, apps/api) --
  // optimistically true until the check resolves, see tournament-submenu.ts's
  // own comment on the same tradeoff.
  protected readonly premiumUnlocked = signal(true);
  protected readonly freeMaxTeams = signal(8);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedTeamIds = signal<Set<string>>(new Set());

  protected readonly divisionsForSelectedCategory = computed(() => {
    const category = this.categories().find((c) => c.id === this.formCategoryId());
    return category?.divisions ?? [];
  });

  protected readonly categoryOptions = computed<SelectOption[]>(() => {
    const lang = this.languageService.language();
    return [
      {
        value: '',
        label: this.transloco.translate('admin.teamList.chooseCategoryOption', {}, lang),
        disabled: true,
      },
      ...this.categories().map((category) => ({ value: category.id, label: category.name })),
    ];
  });
  protected readonly divisionOptions = computed<SelectOption[]>(() => {
    const lang = this.languageService.language();
    return [
      { value: '', label: this.transloco.translate('admin.teamList.noDivisionOption', {}, lang) },
      ...this.divisionsForSelectedCategory().map((division) => ({
        value: division.id,
        label: division.name,
      })),
    ];
  });

  protected readonly editingTeamId = signal<string | null>(null);
  protected readonly formName = signal('');
  protected readonly formCategoryId = signal('');
  protected readonly formDivisionId = signal('');
  protected readonly formManagerName = signal('');
  protected readonly formManagerEmail = signal('');
  protected readonly formManagerPhone = signal('');

  protected readonly importCsv = signal('');
  protected readonly importResult = signal<TeamImportResult | null>(null);

  // Audit finding (securite-audit.md): deleting a team used to fire straight
  // from the row button with no confirmation step at all. First fix reused
  // ap-type-to-confirm (feat/173, "type SUPPRIMER"); reported as more
  // friction than an organizer wants for a team (structure.page.ts's own
  // phase deletion got the same simplification for the same reason) -- an
  // arm/confirm two-click (template's own __confirm-inline) is enough here.
  protected readonly confirmingTeamId = signal<string | null>(null);
  protected readonly deletingTeamId = signal<string | null>(null);
  protected readonly confirmingBulkDelete = signal(false);
  protected readonly bulkDeleting = signal(false);

  protected readonly expandedTeamId = signal<string | null>(null);
  protected readonly players = signal<Player[]>([]);
  protected readonly newPlayerFirstName = signal('');
  protected readonly newPlayerLastName = signal('');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      this.teams.set(await this.teamsService.listTeams(organizationId, this.tournamentId));
      this.categories.set(
        await this.tournamentsService.listCategories(organizationId, this.tournamentId),
      );
      void this.loadPremiumFeatures(organizationId);
    } catch {
      this.errorMessage.set('admin.teamList.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPremiumFeatures(organizationId: string): Promise<void> {
    try {
      const status = await this.tournamentsService.getPremiumFeatures(
        organizationId,
        this.tournamentId,
      );
      this.premiumUnlocked.set(status.unlocked);
      this.freeMaxTeams.set(status.freeMaxTeams);
    } catch {
      // Read-only status check -- see tournament-submenu.ts's own comment.
    }
  }

  protected onFormCategoryChange(categoryId: string): void {
    this.formCategoryId.set(categoryId);
    this.formDivisionId.set('');
  }

  protected startEdit(team: Team): void {
    this.editingTeamId.set(team.id);
    this.formName.set(team.name);
    this.formCategoryId.set(team.categoryId);
    this.formManagerName.set(team.managerName ?? '');
    this.formManagerEmail.set(team.managerEmail ?? '');
    this.formManagerPhone.set(team.managerPhone ?? '');
    // The division <select>'s options are populated from a computed that
    // depends on formCategoryId, set just above in this same tick — the
    // browser only honors a <select> value once its matching <option>
    // exists in the DOM. Set it to empty now (options don't exist yet for
    // the new category) and re-set the real value on the next microtask,
    // once this render has produced those options.
    this.formDivisionId.set('');
    const divisionId = team.divisionId;
    if (divisionId) {
      setTimeout(() => this.formDivisionId.set(divisionId));
    }
  }

  protected cancelEdit(): void {
    this.editingTeamId.set(null);
    this.formName.set('');
    this.formCategoryId.set('');
    this.formDivisionId.set('');
    this.formManagerName.set('');
    this.formManagerEmail.set('');
    this.formManagerPhone.set('');
  }

  protected onFormSubmit(event: Event): void {
    event.preventDefault();
    void this.submitForm();
  }

  protected async submitForm(): Promise<void> {
    const organizationId = this.organization()?.id;
    const name = this.formName().trim();
    const categoryId = this.formCategoryId();
    if (!organizationId || !name || !categoryId) {
      return;
    }
    const managerName = this.formManagerName().trim() || undefined;
    const managerEmail = this.formManagerEmail().trim() || undefined;
    const managerPhone = this.formManagerPhone().trim() || undefined;
    try {
      const editingTeamId = this.editingTeamId();
      if (editingTeamId) {
        const updated = await this.teamsService.updateTeam(
          organizationId,
          this.tournamentId,
          editingTeamId,
          {
            name,
            categoryId,
            // Empty string means "clear the division" for an update, unlike
            // create where it means "no division was chosen".
            divisionId: this.formDivisionId(),
            managerName,
            managerEmail,
            managerPhone,
          },
        );
        this.teams.update((teams) => teams.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const created = await this.teamsService.createTeam(organizationId, this.tournamentId, {
          name,
          categoryId,
          divisionId: this.formDivisionId() || undefined,
          managerName,
          managerEmail,
          managerPhone,
        });
        this.teams.update((teams) => [...teams, created]);
      }
      this.cancelEdit();
    } catch (error) {
      if (isPublicationTierExceededError(error)) {
        this.tierExceededModal.set(error.error);
        return;
      }
      this.errorMessage.set('admin.teamList.errors.save');
    }
  }

  protected closeTierExceededModal(): void {
    this.tierExceededModal.set(null);
    this.tierUpgradeError.set(null);
  }

  /**
   * Pays for the tier the blocked team addition needs. Deliberately NOT
   * plain publish() -- the team that triggered the dialog was blocked
   * before it was ever created, so the tournament's stored team count
   * hasn't grown yet; publish() would price against that still-too-low
   * count and silently do nothing (see
   * TournamentsService.payForTeamAdditionTier's own doc comment, apps/api).
   * This always asks for exactly 1 more team -- the single row this form
   * submits at a time (see submitForm()'s catch above).
   */
  protected async upgradeToNextTier(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || this.tierUpgrading()) {
      return;
    }
    this.tierUpgrading.set(true);
    this.tierUpgradeError.set(null);
    try {
      const result = await this.tournamentsService.payForTeamAdditionTier(
        organizationId,
        this.tournamentId,
        1,
      );
      if (result.status === 'PENDING_PAYMENT') {
        window.location.href = result.checkoutUrl;
        return;
      }
      // Free in this environment (tier price unset) or already covered --
      // the tier is now paid for, but the team that triggered the block
      // still wasn't created. Close the dialog and let the organizer's own
      // next "Ajouter" click go through -- it'll pass the check this time.
      this.tierExceededModal.set(null);
    } catch {
      this.tierUpgradeError.set('admin.teamList.tierModal.errors.upgrade');
    } finally {
      this.tierUpgrading.set(false);
    }
  }

  /** Same idea as upgradeToNextTier, but the organization-wide annual subscription instead of a one-off per-tournament payment. */
  protected async subscribeAnnually(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || this.tierUpgrading()) {
      return;
    }
    this.tierUpgrading.set(true);
    this.tierUpgradeError.set(null);
    try {
      const result = await this.organizationsService.subscribe(organizationId);
      if (result.status === 'PENDING_PAYMENT') {
        window.location.href = result.checkoutUrl;
        return;
      }
      this.tierExceededModal.set(null);
    } catch {
      this.tierUpgradeError.set('admin.teamList.tierModal.errors.subscribe');
    } finally {
      this.tierUpgrading.set(false);
    }
  }

  protected requestDeleteTeam(team: Team): void {
    this.confirmingTeamId.set(team.id);
  }

  protected cancelDeleteTeam(): void {
    this.confirmingTeamId.set(null);
  }

  protected async confirmDeleteTeam(team: Team): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    this.deletingTeamId.set(team.id);
    try {
      await this.teamsService.deleteTeam(organizationId, this.tournamentId, team.id);
      this.teams.update((teams) => teams.filter((t) => t.id !== team.id));
      this.confirmingTeamId.set(null);
    } catch {
      this.errorMessage.set('admin.teamList.errors.remove');
    } finally {
      this.deletingTeamId.set(null);
    }
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  protected async onLogoFileSelected(team: Team, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file later (e.g. after an error)
    const organizationId = this.organization()?.id;
    if (!file || !organizationId) {
      return;
    }
    try {
      const updated = await this.teamsService.uploadLogo(
        organizationId,
        this.tournamentId,
        team.id,
        file,
      );
      this.teams.update((teams) => teams.map((t) => (t.id === updated.id ? updated : t)));
    } catch (error) {
      let key = 'admin.teamList.errors.logoUpload';
      if (error instanceof HttpErrorResponse) {
        if (error.status === 403) {
          key = 'admin.teamList.errors.logoPremiumLocked';
        } else if (error.status === 400) {
          key = 'admin.teamList.errors.logoInvalid';
        }
      }
      this.errorMessage.set(key);
    }
  }

  protected async removeLogo(team: Team): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      const updated = await this.teamsService.removeLogo(
        organizationId,
        this.tournamentId,
        team.id,
      );
      this.teams.update((teams) => teams.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      this.errorMessage.set('admin.teamList.errors.logoRemove');
    }
  }

  protected toggleSelected(teamId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedTeamIds.update((ids) => {
      const next = new Set(ids);
      if (checked) {
        next.add(teamId);
      } else {
        next.delete(teamId);
      }
      return next;
    });
  }

  protected isSelected(teamId: string): boolean {
    return this.selectedTeamIds().has(teamId);
  }

  protected requestDeleteSelected(): void {
    if (this.selectedTeamIds().size > 0) {
      this.confirmingBulkDelete.set(true);
    }
  }

  protected cancelDeleteSelected(): void {
    this.confirmingBulkDelete.set(false);
  }

  protected async confirmDeleteSelected(): Promise<void> {
    const organizationId = this.organization()?.id;
    const teamIds = [...this.selectedTeamIds()];
    if (!organizationId || teamIds.length === 0) {
      return;
    }
    this.bulkDeleting.set(true);
    try {
      await this.teamsService.bulkDeleteTeams(organizationId, this.tournamentId, teamIds);
      this.teams.update((teams) => teams.filter((t) => !teamIds.includes(t.id)));
      this.selectedTeamIds.set(new Set());
      this.confirmingBulkDelete.set(false);
    } catch {
      this.errorMessage.set('admin.teamList.errors.deleteSelected');
    } finally {
      this.bulkDeleting.set(false);
    }
  }

  protected onImportCsvChange(event: Event): void {
    this.importCsv.set((event.target as HTMLTextAreaElement).value);
  }

  protected onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.importCsv.set(String(reader.result ?? ''));
    };
    reader.readAsText(file);
    input.value = '';
  }

  protected async runImport(): Promise<void> {
    const organizationId = this.organization()?.id;
    const csv = this.importCsv().trim();
    if (!organizationId || !csv) {
      return;
    }
    try {
      const result = await this.teamsService.importTeams(organizationId, this.tournamentId, csv);
      this.importResult.set(result);
      this.teams.update((teams) => [...teams, ...result.created]);
    } catch {
      this.errorMessage.set('admin.teamList.errors.import');
    }
  }

  protected async exportCsv(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      const csv = await this.teamsService.exportTeams(organizationId, this.tournamentId);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'equipes.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      this.errorMessage.set('admin.teamList.errors.export');
    }
  }

  protected async togglePlayers(team: Team): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    if (this.expandedTeamId() === team.id) {
      this.expandedTeamId.set(null);
      return;
    }
    this.expandedTeamId.set(team.id);
    try {
      this.players.set(
        await this.teamsService.listPlayers(organizationId, this.tournamentId, team.id),
      );
    } catch {
      this.errorMessage.set('admin.teamList.errors.loadPlayers');
    }
  }

  protected onNewPlayerFirstNameChange(value: string): void {
    this.newPlayerFirstName.set(value);
  }

  protected onNewPlayerLastNameChange(value: string): void {
    this.newPlayerLastName.set(value);
  }

  protected async addPlayer(team: Team): Promise<void> {
    const organizationId = this.organization()?.id;
    const firstName = this.newPlayerFirstName().trim();
    const lastName = this.newPlayerLastName().trim();
    if (!organizationId || !firstName || !lastName) {
      return;
    }
    try {
      const player = await this.teamsService.addPlayer(organizationId, this.tournamentId, team.id, {
        firstName,
        lastName,
      });
      this.players.update((players) => [...players, player]);
      this.newPlayerFirstName.set('');
      this.newPlayerLastName.set('');
    } catch {
      this.errorMessage.set('admin.teamList.errors.addPlayer');
    }
  }

  protected async removePlayer(team: Team, player: Player): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.teamsService.removePlayer(organizationId, this.tournamentId, team.id, player.id);
      this.players.update((players) => players.filter((p) => p.id !== player.id));
    } catch {
      this.errorMessage.set('admin.teamList.errors.removePlayer');
    }
  }

  protected formatAmount(amountCents: number, currency: string): string {
    return new Intl.NumberFormat(this.languageService.language(), {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  }

  // Matches the landing page's public pricing tags (apps/web's own
  // landing.pricing.*.tag i18n) -- same 3 tiers, same names, just reused
  // here rather than duplicated with a different wording.
  protected tierLabel(tier: PublicationTierCode): string {
    const key =
      tier === 'FREE'
        ? 'landing.pricing.free.tag'
        : tier === 'STANDARD'
          ? 'landing.pricing.standard.tag'
          : 'landing.pricing.large.tag';
    return this.transloco.translate(key, {}, this.languageService.language());
  }
}
