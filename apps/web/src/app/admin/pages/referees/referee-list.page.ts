import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { Referee, TournamentDetail } from '../../core/models';
import { RefereesService } from '../../core/referees.service';
import { TournamentsService } from '../../core/tournaments.service';

@Component({
  selector: 'app-referee-list-page',
  imports: [Button, TextField],
  templateUrl: './referee-list.page.html',
  styleUrl: './referee-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefereeListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly refereesService = inject(RefereesService);
  private readonly tournamentsService = inject(TournamentsService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly tournament = signal<TournamentDetail | null>(null);
  protected readonly referees = signal<Referee[]>([]);

  protected readonly editingRefereeId = signal<string | null>(null);
  protected readonly formFirstName = signal('');
  protected readonly formLastName = signal('');
  protected readonly formEmail = signal('');
  protected readonly formPhone = signal('');

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
      this.tournament.set(
        await this.tournamentsService.getTournament(organizationId, this.tournamentId),
      );
      this.referees.set(await this.refereesService.listReferees(organizationId, this.tournamentId));
    } catch {
      this.errorMessage.set('Impossible de charger les arbitres.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleTeamsCanReferee(event: Event): Promise<void> {
    const organizationId = this.organization()?.id;
    const teamsCanReferee = (event.target as HTMLInputElement).checked;
    if (!organizationId) {
      return;
    }
    try {
      const updated = await this.tournamentsService.updateTournament(
        organizationId,
        this.tournamentId,
        { teamsCanReferee },
      );
      this.tournament.set(updated);
    } catch {
      this.errorMessage.set('Impossible de mettre à jour ce réglage.');
    }
  }

  protected startEdit(referee: Referee): void {
    this.editingRefereeId.set(referee.id);
    this.formFirstName.set(referee.firstName);
    this.formLastName.set(referee.lastName);
    this.formEmail.set(referee.email ?? '');
    this.formPhone.set(referee.phone ?? '');
  }

  protected cancelEdit(): void {
    this.editingRefereeId.set(null);
    this.formFirstName.set('');
    this.formLastName.set('');
    this.formEmail.set('');
    this.formPhone.set('');
  }

  protected onFormSubmit(event: Event): void {
    event.preventDefault();
    void this.submitForm();
  }

  protected async submitForm(): Promise<void> {
    const organizationId = this.organization()?.id;
    const firstName = this.formFirstName().trim();
    const lastName = this.formLastName().trim();
    if (!organizationId || !firstName || !lastName) {
      return;
    }
    const payload = {
      firstName,
      lastName,
      email: this.formEmail().trim() || undefined,
      phone: this.formPhone().trim() || undefined,
    };
    try {
      const editingRefereeId = this.editingRefereeId();
      if (editingRefereeId) {
        const updated = await this.refereesService.updateReferee(
          organizationId,
          this.tournamentId,
          editingRefereeId,
          payload,
        );
        this.referees.update((referees) =>
          referees.map((r) => (r.id === updated.id ? updated : r)),
        );
      } else {
        const created = await this.refereesService.createReferee(
          organizationId,
          this.tournamentId,
          payload,
        );
        this.referees.update((referees) => [...referees, created]);
      }
      this.cancelEdit();
    } catch {
      this.errorMessage.set("Impossible d'enregistrer cet arbitre.");
    }
  }

  protected async removeReferee(referee: Referee): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.refereesService.deleteReferee(organizationId, this.tournamentId, referee.id);
      this.referees.update((referees) => referees.filter((r) => r.id !== referee.id));
    } catch {
      this.errorMessage.set('Impossible de retirer cet arbitre.');
    }
  }
}
