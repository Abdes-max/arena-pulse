import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Button, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { OrganizationMember, OrganizationRole, PendingInvitation } from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';

@Component({
  selector: 'app-collaborators-page',
  imports: [ReactiveFormsModule, Button, TextField],
  templateUrl: './collaborators.page.html',
  styleUrl: './collaborators.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollaboratorsPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly organizationsService = inject(OrganizationsService);
  protected readonly authService = inject(AuthService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly isAdmin = computed(() => this.organization()?.role === 'ORG_ADMIN');

  protected readonly members = signal<OrganizationMember[]>([]);
  protected readonly pendingInvitations = signal<PendingInvitation[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly inviting = signal(false);

  protected readonly inviteForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['ORG_MEMBER' as OrganizationRole, Validators.required],
  });

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
      const [members, pending] = await Promise.all([
        this.organizationsService.listMembers(organizationId),
        this.isAdmin() ? this.organizationsService.listPendingInvitations(organizationId) : Promise.resolve([]),
      ]);
      this.members.set(members);
      this.pendingInvitations.set(pending);
    } catch {
      this.errorMessage.set('Impossible de charger les collaborateurs.');
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
          ? 'Cette personne est déjà membre ou a déjà une invitation en attente.'
          : "Impossible d'inviter cette personne, réessayez.",
      );
    } finally {
      this.inviting.set(false);
    }
  }

  protected onRoleChange(member: OrganizationMember, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as OrganizationRole;
    void this.changeRole(member, role);
  }

  private async changeRole(member: OrganizationMember, role: OrganizationRole): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.organizationsService.changeRole(organizationId, member.id, role);
      this.members.update((members) => members.map((m) => (m.id === member.id ? { ...m, role } : m)));
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? "Impossible de modifier ce rôle : c'est le dernier administrateur de l'organisation."
          : 'Impossible de modifier ce rôle, réessayez.',
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
          ? "Impossible de retirer ce collaborateur : c'est le dernier administrateur de l'organisation."
          : 'Impossible de retirer ce collaborateur, réessayez.',
      );
    }
  }

  protected async revokeInvitation(invitation: PendingInvitation): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    await this.organizationsService.revokeInvitation(organizationId, invitation.id);
    this.pendingInvitations.update((invitations) => invitations.filter((i) => i.id !== invitation.id));
  }
}
