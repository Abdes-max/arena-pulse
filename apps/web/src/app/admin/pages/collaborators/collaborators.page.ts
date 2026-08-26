import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { DEFAULT_THEME, LanguageService, ThemeService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import {
  OrganizationMember,
  OrganizationRole,
  PendingInvitation,
  Permission,
  Tournament,
  TournamentAdministrator,
} from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';
import { PermissionsService } from '../../core/permissions.service';
import { TournamentsService } from '../../core/tournaments.service';

@Component({
  selector: 'app-collaborators-page',
  imports: [ReactiveFormsModule, Button, Select, TextField, TranslocoPipe],
  templateUrl: './collaborators.page.html',
  styleUrl: './collaborators.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollaboratorsPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly organizationsService = inject(OrganizationsService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly permissionsService = inject(PermissionsService);
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly authService = inject(AuthService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly isAdmin = computed(() => this.organization()?.role === 'ORG_ADMIN');

  // Recomputed on every language switch (reads the active language signal),
  // same reasoning as ap-share-button's [text] input elsewhere in this app --
  // ap-select's [options] is a plain input, not template markup, so there's
  // no `| transloco` pipe to bind these labels through.
  protected readonly roleOptions = computed<SelectOption[]>(() => {
    const lang = this.languageService.language();
    return [
      {
        value: 'ORG_MEMBER',
        label: this.transloco.translate('admin.collaborators.roleMember', {}, lang),
      },
      {
        value: 'ORG_ADMIN',
        label: this.transloco.translate('admin.collaborators.roleAdmin', {}, lang),
      },
    ];
  });
  protected readonly members = signal<OrganizationMember[]>([]);
  protected readonly pendingInvitations = signal<PendingInvitation[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly inviting = signal(false);

  protected readonly inviteForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['ORG_MEMBER' as OrganizationRole, Validators.required],
  });

  // Tournament administrators (moved here from each tournament's own Général
  // tab -- adding one requires the email to already be an org member/
  // collaborator, see addAdministrator's 404 handling below, so this is a
  // more natural home than the per-tournament form). Distinct from the org
  // membership above: a person can be an org collaborator without being an
  // administrator of any given tournament, and vice versa isn't possible
  // (see addAdministrator).
  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly selectedTournamentId = signal('');
  protected readonly tournamentOptions = computed<SelectOption[]>(() =>
    this.tournaments().map((tournament) => ({ value: tournament.id, label: tournament.name })),
  );
  protected readonly permissions = signal<Permission[]>([]);
  protected readonly administrators = signal<TournamentAdministrator[]>([]);
  protected readonly administratorsLoading = signal(false);
  protected readonly newAdministratorEmail = signal('');
  protected readonly newAdministratorPermissionKeys = signal<string[]>([]);

  constructor() {
    void this.load();
    void this.loadTournaments();

    // Collaborators isn't tied to any one tournament, so it stays on the
    // fixed product identity regardless of the last tournament theme picked
    // in the edit form -- restored to that picked theme (ThemeService.
    // adminTheme) on the way out, same apply-then-reset pattern used to
    // scope a tournament's public theme to just its own pages.
    this.themeService.setTheme(document.documentElement, DEFAULT_THEME);
    this.destroyRef.onDestroy(() => {
      this.themeService.setTheme(document.documentElement, this.themeService.adminTheme());
    });
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [members, pending] = await Promise.all([
        this.organizationsService.listMembers(organizationId),
        this.isAdmin()
          ? this.organizationsService.listPendingInvitations(organizationId)
          : Promise.resolve([]),
      ]);
      this.members.set(members);
      this.pendingInvitations.set(pending);
    } catch {
      this.errorMessage.set('admin.collaborators.errorLoad');
    } finally {
      this.loading.set(false);
    }
  }

  protected async invite(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId || this.inviteForm.invalid || this.inviting()) {
      return;
    }
    this.inviting.set(true);
    this.errorMessage.set(null);
    try {
      const { email, role } = this.inviteForm.getRawValue();
      const invitation = await this.organizationsService.invite(organizationId, email, role);
      this.pendingInvitations.update((invitations) => [invitation, ...invitations]);
      this.inviteForm.reset({ email: '', role: 'ORG_MEMBER' });
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'admin.collaborators.errorInviteConflict'
          : 'admin.collaborators.errorInviteGeneric',
      );
    } finally {
      this.inviting.set(false);
    }
  }

  protected onRoleChange(member: OrganizationMember, role: string): void {
    void this.changeRole(member, role as OrganizationRole);
  }

  private async changeRole(member: OrganizationMember, role: OrganizationRole): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.organizationsService.changeRole(organizationId, member.id, role);
      this.members.update((members) =>
        members.map((m) => (m.id === member.id ? { ...m, role } : m)),
      );
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'admin.collaborators.errorRoleLastAdmin'
          : 'admin.collaborators.errorRoleGeneric',
      );
    }
  }

  protected async removeMember(member: OrganizationMember): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.organizationsService.removeMember(organizationId, member.id);
      this.members.update((members) => members.filter((m) => m.id !== member.id));
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'admin.collaborators.errorRemoveLastAdmin'
          : 'admin.collaborators.errorRemoveGeneric',
      );
    }
  }

  protected async revokeInvitation(invitation: PendingInvitation): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    await this.organizationsService.revokeInvitation(organizationId, invitation.id);
    this.pendingInvitations.update((invitations) =>
      invitations.filter((i) => i.id !== invitation.id),
    );
  }

  private async loadTournaments(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      const [tournaments, permissions] = await Promise.all([
        this.tournamentsService.listTournaments(organizationId),
        this.permissionsService.listPermissions(),
      ]);
      this.tournaments.set(tournaments);
      this.permissions.set(permissions);
      if (tournaments.length > 0) {
        this.selectedTournamentId.set(tournaments[0].id);
        await this.loadAdministrators();
      }
    } catch {
      this.errorMessage.set('admin.collaborators.tournamentAdmins.errorLoad');
    }
  }

  protected async onTournamentChange(tournamentId: string): Promise<void> {
    this.selectedTournamentId.set(tournamentId);
    this.newAdministratorEmail.set('');
    this.newAdministratorPermissionKeys.set([]);
    await this.loadAdministrators();
  }

  private async loadAdministrators(): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.selectedTournamentId();
    if (!organizationId || !tournamentId) {
      return;
    }
    this.administratorsLoading.set(true);
    try {
      this.administrators.set(
        await this.tournamentsService.listAdministrators(organizationId, tournamentId),
      );
    } catch {
      this.errorMessage.set('admin.collaborators.tournamentAdmins.errorLoad');
    } finally {
      this.administratorsLoading.set(false);
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
    const tournamentId = this.selectedTournamentId();
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
          ? 'admin.collaborators.tournamentAdmins.errorAddNotMember'
          : 'admin.collaborators.tournamentAdmins.errorAddGeneric',
      );
    }
  }

  protected async removeAdministrator(administrator: TournamentAdministrator): Promise<void> {
    const organizationId = this.organization()?.id;
    const tournamentId = this.selectedTournamentId();
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
      this.errorMessage.set('admin.collaborators.tournamentAdmins.errorRemove');
    }
  }
}
