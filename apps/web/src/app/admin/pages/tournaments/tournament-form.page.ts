import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Badge, BadgeStatus, Button, Select, SelectOption, TextField } from 'design-system';
import { ThemeService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import {
  Category,
  Permission,
  PublicTheme,
  Sport,
  TournamentAdministrator,
  TournamentDetail,
  TournamentStatus,
  Venue,
} from '../../core/models';
import { PermissionsService } from '../../core/permissions.service';
import { SportsService } from '../../core/sports.service';
import { THEME_MAP } from '../../core/theme-map';
import { TournamentsService } from '../../core/tournaments.service';

const STATUS_TO_BADGE: Record<TournamentStatus, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

@Component({
  selector: 'app-tournament-form-page',
  imports: [ReactiveFormsModule, Button, TextField, Select, Badge],
  templateUrl: './tournament-form.page.html',
  styleUrl: './tournament-form.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly sportsService = inject(SportsService);
  private readonly permissionsService = inject(PermissionsService);
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  private readonly paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  protected readonly tournamentId = computed(() => this.paramMap().get('tournamentId'));
  protected readonly isEditMode = computed(() => this.tournamentId() !== null);
  protected readonly statusBadge = STATUS_TO_BADGE;

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly sports = signal<Sport[]>([]);
  protected readonly sportOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Choisir un sport', disabled: true },
    ...this.sports().map((sport) => ({ value: sport.id, label: sport.name })),
  ]);
  protected readonly themeOptions: SelectOption[] = [
    { value: 'INK_SIGNAL', label: 'Ink & Signal' },
    { value: 'PULSE_EMBER', label: 'Pulse Ember' },
    { value: 'NEON_COURT', label: 'Neon Court' },
  ];
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly venues = signal<Venue[]>([]);
  protected readonly administrators = signal<TournamentAdministrator[]>([]);

  protected readonly isArchived = computed(() => this.tournament()?.status === 'ARCHIVED');

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    sportId: ['', Validators.required],
    isOnline: [false],
    theme: ['INK_SIGNAL' as PublicTheme],
  });

  protected readonly newCategoryName = signal('');
  protected readonly newCategoryFeeCents = signal('');
  protected readonly categoryFeeDraftById = signal<Record<string, string>>({});
  protected readonly newDivisionNameByCategory = signal<Record<string, string>>({});
  protected readonly newVenueName = signal('');
  protected readonly newFieldNameByVenue = signal<Record<string, string>>({});
  protected readonly newAdministratorEmail = signal('');
  protected readonly newAdministratorPermissionKeys = signal<string[]>([]);

  constructor() {
    effect(() => {
      this.tournamentId();
      void this.load();
    });
    if (this.route.snapshot.queryParamMap.get('publishCancelled')) {
      this.errorMessage.set("Paiement annulé : le tournoi n'a pas été publié.");
    }

    // Applies the selected public theme across the whole admin app as soon
    // as it's picked, not just this page -- setAdminTheme persists it
    // (ThemeService.adminTheme), so it survives navigating to this
    // tournament's other sub-pages (Équipes, Arbitres, Structure,
    // Calendrier, Scores, Classement) as well as Tournois/Collaborateurs,
    // and resetThemeGuard restores it (instead of the fixed product
    // identity) the next time /admin is entered from outside.
    const selectedTheme = toSignal(this.form.controls.theme.valueChanges, {
      initialValue: this.form.controls.theme.value,
    });
    effect(() => {
      this.themeService.setAdminTheme(document.documentElement, THEME_MAP[selectedTheme()]);
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.newCategoryName.set('');
    this.newCategoryFeeCents.set('');
    this.categoryFeeDraftById.set({});
    this.newDivisionNameByCategory.set({});
    this.newVenueName.set('');
    this.newFieldNameByVenue.set({});
    this.newAdministratorEmail.set('');
    this.newAdministratorPermissionKeys.set([]);
    try {
      this.sports.set(await this.sportsService.listSports());
      this.permissions.set(await this.permissionsService.listPermissions());
      if (this.isEditMode()) {
        await this.loadTournament();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les données du tournoi.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTournament(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    const tournament = await this.tournamentsService.getTournament(organizationId, tournamentId);
    this.tournament.set(tournament);
    this.form.patchValue({
      name: tournament.name,
      sportId: tournament.sportId,
      isOnline: tournament.isOnline,
      theme: tournament.theme,
    });
    const categories = await this.tournamentsService.listCategories(organizationId, tournamentId);
    this.categories.set(categories);
    this.categoryFeeDraftById.set(
      Object.fromEntries(
        categories.map((category) => [
          category.id,
          category.registrationFeeCents !== null ? String(category.registrationFeeCents) : '',
        ]),
      ),
    );
    this.venues.set(await this.tournamentsService.listVenues(organizationId, tournamentId));
    this.administrators.set(
      await this.tournamentsService.listAdministrators(organizationId, tournamentId),
    );
  }

  protected async submit(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const { name, sportId, isOnline, theme } = this.form.getRawValue();
      const tournamentId = this.tournamentId();
      if (this.isEditMode() && tournamentId) {
        const updated = await this.tournamentsService.updateTournament(
          organizationId,
          tournamentId,
          {
            name,
            sportId,
            isOnline,
            theme,
          },
        );
        this.tournament.set(updated);
      } else {
        const created = await this.tournamentsService.createTournament(organizationId, {
          name,
          sportId,
          isOnline,
          theme,
        });
        await this.router.navigate(['/admin/tournaments', created.id]);
      }
    } catch {
      this.errorMessage.set("Impossible d'enregistrer le tournoi.");
    } finally {
      this.submitting.set(false);
    }
  }

  protected async publish(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      const result = await this.tournamentsService.publish(organizationId, tournamentId);
      if (result.status === 'PENDING_PAYMENT') {
        window.location.href = result.checkoutUrl;
        return;
      }
      this.tournament.set(result);
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? "Cette action n'est pas possible dans l'état actuel du tournoi."
          : 'Une erreur est survenue, réessayez.',
      );
    }
  }

  protected unpublish(): Promise<void> {
    return this.runLifecycleAction((organizationId, tournamentId) =>
      this.tournamentsService.unpublish(organizationId, tournamentId),
    );
  }

  protected archive(): Promise<void> {
    return this.runLifecycleAction((organizationId, tournamentId) =>
      this.tournamentsService.archive(organizationId, tournamentId),
    );
  }

  protected unarchive(): Promise<void> {
    return this.runLifecycleAction((organizationId, tournamentId) =>
      this.tournamentsService.unarchive(organizationId, tournamentId),
    );
  }

  protected async duplicate(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    try {
      const clone = await this.tournamentsService.duplicate(organizationId, tournamentId);
      await this.router.navigate(['/admin/tournaments', clone.id]);
    } catch {
      this.errorMessage.set('Impossible de dupliquer ce tournoi.');
    }
  }

  private async runLifecycleAction(
    action: (organizationId: string, tournamentId: string) => Promise<TournamentDetail>,
  ): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    this.errorMessage.set(null);
    try {
      this.tournament.set(await action(organizationId, tournamentId));
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? "Cette action n'est pas possible dans l'état actuel du tournoi."
          : 'Une erreur est survenue, réessayez.',
      );
    }
  }

  protected onNewCategoryNameChange(value: string): void {
    this.newCategoryName.set(value);
  }

  protected onNewCategoryFeeCentsChange(value: string): void {
    this.newCategoryFeeCents.set(value);
  }

  protected async addCategory(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    const name = this.newCategoryName().trim();
    if (!organizationId || !tournamentId || !name) {
      return;
    }
    const feeCents = this.newCategoryFeeCents().trim();
    try {
      const category = await this.tournamentsService.createCategory(
        organizationId,
        tournamentId,
        name,
        feeCents ? Number(feeCents) : undefined,
      );
      this.categories.update((categories) => [...categories, category]);
      this.categoryFeeDraftById.update((drafts) => ({ ...drafts, [category.id]: feeCents }));
      this.newCategoryName.set('');
      this.newCategoryFeeCents.set('');
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette catégorie (nom déjà utilisé ?).");
    }
  }

  protected categoryFeeDraftFor(categoryId: string): string {
    return this.categoryFeeDraftById()[categoryId] ?? '';
  }

  protected onCategoryFeeDraftChange(categoryId: string, value: string): void {
    this.categoryFeeDraftById.update((drafts) => ({ ...drafts, [categoryId]: value }));
  }

  protected async saveCategoryFee(category: Category): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    const draft = this.categoryFeeDraftFor(category.id).trim();
    try {
      const updated = await this.tournamentsService.updateCategoryFee(
        organizationId,
        tournamentId,
        category.id,
        draft ? Number(draft) : null,
      );
      this.categories.update((categories) =>
        categories.map((c) => (c.id === category.id ? updated : c)),
      );
    } catch {
      this.errorMessage.set("Impossible d'enregistrer le tarif de cette catégorie.");
    }
  }

  protected async removeCategory(category: Category): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    try {
      await this.tournamentsService.deleteCategory(organizationId, tournamentId, category.id);
      this.categories.update((categories) => categories.filter((c) => c.id !== category.id));
    } catch {
      this.errorMessage.set('Impossible de supprimer cette catégorie.');
    }
  }

  protected divisionNameFor(categoryId: string): string {
    return this.newDivisionNameByCategory()[categoryId] ?? '';
  }

  protected onNewDivisionNameChange(categoryId: string, value: string): void {
    this.newDivisionNameByCategory.update((names) => ({ ...names, [categoryId]: value }));
  }

  protected async addDivision(category: Category): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    const name = this.divisionNameFor(category.id).trim();
    if (!organizationId || !tournamentId || !name) {
      return;
    }
    try {
      const division = await this.tournamentsService.createDivision(
        organizationId,
        tournamentId,
        category.id,
        name,
      );
      this.categories.update((categories) =>
        categories.map((c) =>
          c.id === category.id ? { ...c, divisions: [...c.divisions, division] } : c,
        ),
      );
      this.newDivisionNameByCategory.update((names) => ({ ...names, [category.id]: '' }));
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette division (nom déjà utilisé ?).");
    }
  }

  protected async removeDivision(category: Category, divisionId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    try {
      await this.tournamentsService.deleteDivision(organizationId, tournamentId, divisionId);
      this.categories.update((categories) =>
        categories.map((c) =>
          c.id === category.id
            ? { ...c, divisions: c.divisions.filter((d) => d.id !== divisionId) }
            : c,
        ),
      );
    } catch {
      this.errorMessage.set('Impossible de supprimer cette division.');
    }
  }

  protected onNewVenueNameChange(value: string): void {
    this.newVenueName.set(value);
  }

  protected async addVenue(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    const name = this.newVenueName().trim();
    if (!organizationId || !tournamentId || !name) {
      return;
    }
    try {
      const venue = await this.tournamentsService.createVenue(organizationId, tournamentId, {
        name,
      });
      this.venues.update((venues) => [...venues, venue]);
      this.newVenueName.set('');
    } catch {
      this.errorMessage.set("Impossible d'ajouter ce site (nom déjà utilisé ?).");
    }
  }

  protected async removeVenue(venue: Venue): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    try {
      await this.tournamentsService.deleteVenue(organizationId, tournamentId, venue.id);
      this.venues.update((venues) => venues.filter((v) => v.id !== venue.id));
    } catch {
      this.errorMessage.set('Impossible de supprimer ce site.');
    }
  }

  protected fieldNameFor(venueId: string): string {
    return this.newFieldNameByVenue()[venueId] ?? '';
  }

  protected onNewFieldNameChange(venueId: string, value: string): void {
    this.newFieldNameByVenue.update((names) => ({ ...names, [venueId]: value }));
  }

  protected async addField(venue: Venue): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    const name = this.fieldNameFor(venue.id).trim();
    if (!organizationId || !tournamentId || !name) {
      return;
    }
    try {
      const field = await this.tournamentsService.createField(
        organizationId,
        tournamentId,
        venue.id,
        { name },
      );
      this.venues.update((venues) =>
        venues.map((v) => (v.id === venue.id ? { ...v, fields: [...v.fields, field] } : v)),
      );
      this.newFieldNameByVenue.update((names) => ({ ...names, [venue.id]: '' }));
    } catch {
      this.errorMessage.set("Impossible d'ajouter ce terrain (nom déjà utilisé ?).");
    }
  }

  protected async removeField(venue: Venue, fieldId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    try {
      await this.tournamentsService.deleteField(organizationId, tournamentId, fieldId);
      this.venues.update((venues) =>
        venues.map((v) =>
          v.id === venue.id ? { ...v, fields: v.fields.filter((f) => f.id !== fieldId) } : v,
        ),
      );
    } catch {
      this.errorMessage.set('Impossible de supprimer ce terrain.');
    }
  }

  protected onNewAdministratorEmailChange(value: string): void {
    this.newAdministratorEmail.set(value);
  }

  protected togglePermission(key: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.newAdministratorPermissionKeys.update((keys) =>
      checked ? [...keys, key] : keys.filter((k) => k !== key),
    );
  }

  protected applyPresetFull(): void {
    this.newAdministratorPermissionKeys.set(this.permissions().map((permission) => permission.key));
  }

  protected applyPresetReferee(): void {
    this.newAdministratorPermissionKeys.set(['MANAGE_SCORES']);
  }

  protected async addAdministrator(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    const email = this.newAdministratorEmail().trim();
    if (!organizationId || !tournamentId || !email) {
      return;
    }
    try {
      const administrator = await this.tournamentsService.addAdministrator(
        organizationId,
        tournamentId,
        email,
        this.newAdministratorPermissionKeys(),
      );
      this.administrators.update((administrators) => [...administrators, administrator]);
      this.newAdministratorEmail.set('');
      this.newAdministratorPermissionKeys.set([]);
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? "Cette personne doit d'abord être membre de l'organisation."
          : "Impossible d'ajouter cet administrateur.",
      );
    }
  }

  protected async removeAdministrator(administrator: TournamentAdministrator): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    try {
      await this.tournamentsService.removeAdministrator(
        organizationId,
        tournamentId,
        administrator.id,
      );
      this.administrators.update((administrators) =>
        administrators.filter((a) => a.id !== administrator.id),
      );
    } catch {
      this.errorMessage.set('Impossible de retirer cet administrateur.');
    }
  }
}
