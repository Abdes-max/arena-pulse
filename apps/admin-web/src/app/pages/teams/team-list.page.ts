import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { Category, Player, Team, TeamImportResult } from '../../core/models';
import { TeamsService } from '../../core/teams.service';
import { TournamentsService } from '../../core/tournaments.service';

@Component({
  selector: 'app-team-list-page',
  imports: [Button],
  templateUrl: './team-list.page.html',
  styleUrl: './team-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly teamsService = inject(TeamsService);
  private readonly tournamentsService = inject(TournamentsService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly teams = signal<Team[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedTeamIds = signal<Set<string>>(new Set());

  protected readonly divisionsForSelectedCategory = computed(() => {
    const category = this.categories().find((c) => c.id === this.formCategoryId());
    return category?.divisions ?? [];
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
    } catch {
      this.errorMessage.set('Impossible de charger les équipes.');
    } finally {
      this.loading.set(false);
    }
  }

  protected onFormCategoryChange(event: Event): void {
    this.formCategoryId.set((event.target as HTMLSelectElement).value);
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
    } catch {
      this.errorMessage.set("Impossible d'enregistrer cette équipe (nom déjà utilisé ?).");
    }
  }

  protected async removeTeam(team: Team): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.teamsService.deleteTeam(organizationId, this.tournamentId, team.id);
      this.teams.update((teams) => teams.filter((t) => t.id !== team.id));
    } catch {
      this.errorMessage.set('Impossible de supprimer cette équipe.');
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

  protected async deleteSelected(): Promise<void> {
    const organizationId = this.organization()?.id;
    const teamIds = [...this.selectedTeamIds()];
    if (!organizationId || teamIds.length === 0) {
      return;
    }
    try {
      await this.teamsService.bulkDeleteTeams(organizationId, this.tournamentId, teamIds);
      this.teams.update((teams) => teams.filter((t) => !teamIds.includes(t.id)));
      this.selectedTeamIds.set(new Set());
    } catch {
      this.errorMessage.set('Impossible de supprimer les équipes sélectionnées.');
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
      this.errorMessage.set("Impossible d'importer ce fichier.");
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
      this.errorMessage.set("Impossible d'exporter les équipes.");
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
      this.errorMessage.set('Impossible de charger les joueurs de cette équipe.');
    }
  }

  protected onNewPlayerFirstNameChange(event: Event): void {
    this.newPlayerFirstName.set((event.target as HTMLInputElement).value);
  }

  protected onNewPlayerLastNameChange(event: Event): void {
    this.newPlayerLastName.set((event.target as HTMLInputElement).value);
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
      this.errorMessage.set("Impossible d'ajouter ce joueur.");
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
      this.errorMessage.set('Impossible de retirer ce joueur.');
    }
  }
}
