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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Badge, BadgeStatus, Button, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import {
  Category,
  Permission,
  Sport,
  TournamentAdministrator,
  TournamentDetail,
  TournamentStatus,
} from '../../core/models';
import { PermissionsService } from '../../core/permissions.service';
import { SportsService } from '../../core/sports.service';
import { TournamentsService } from '../../core/tournaments.service';

const STATUS_TO_BADGE: Record<TournamentStatus, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

@Component({
  selector: 'app-tournament-form-page',
  imports: [ReactiveFormsModule, RouterLink, Button, TextField, Badge],
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
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly administrators = signal<TournamentAdministrator[]>([]);

  protected readonly isArchived = computed(() => this.tournament()?.status === 'ARCHIVED');

  protected readonly form = this.formBuilder.nonNullable.group({
    name: ['', Validators.required],
    sportId: ['', Validators.required],
    isOnline: [false],
  });

  protected readonly newCategoryName = signal('');
  protected readonly newDivisionNameByCategory = signal<Record<string, string>>({});
  protected readonly newAdministratorEmail = signal('');
  protected readonly newAdministratorPermissionKeys = signal<string[]>([]);

  constructor() {
    effect(() => {
      this.tournamentId();
      void this.load();
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.newCategoryName.set('');
    this.newDivisionNameByCategory.set({});
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
    });
    this.categories.set(await this.tournamentsService.listCategories(organizationId, tournamentId));
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
      const { name, sportId, isOnline } = this.form.getRawValue();
      const tournamentId = this.tournamentId();
      if (this.isEditMode() && tournamentId) {
        const updated = await this.tournamentsService.updateTournament(
          organizationId,
          tournamentId,
          {
            name,
            sportId,
            isOnline,
          },
        );
        this.tournament.set(updated);
      } else {
        const created = await this.tournamentsService.createTournament(organizationId, {
          name,
          sportId,
          isOnline,
        });
        await this.router.navigate(['/tournaments', created.id]);
      }
    } catch {
      this.errorMessage.set("Impossible d'enregistrer le tournoi.");
    } finally {
      this.submitting.set(false);
    }
  }

  protected publish(): Promise<void> {
    return this.runLifecycleAction((organizationId, tournamentId) =>
      this.tournamentsService.publish(organizationId, tournamentId),
    );
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
      await this.router.navigate(['/tournaments', clone.id]);
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

  protected onNewCategoryNameChange(event: Event): void {
    this.newCategoryName.set((event.target as HTMLInputElement).value);
  }

  protected async addCategory(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.tournamentId();
    const name = this.newCategoryName().trim();
    if (!organizationId || !tournamentId || !name) {
      return;
    }
    try {
      const category = await this.tournamentsService.createCategory(
        organizationId,
        tournamentId,
        name,
      );
      this.categories.update((categories) => [...categories, category]);
      this.newCategoryName.set('');
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette catégorie (nom déjà utilisé ?).");
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

  protected onNewDivisionNameChange(categoryId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
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

  protected onNewAdministratorEmailChange(event: Event): void {
    this.newAdministratorEmail.set((event.target as HTMLInputElement).value);
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
