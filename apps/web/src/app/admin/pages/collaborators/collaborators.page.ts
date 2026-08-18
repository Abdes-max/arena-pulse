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
import { OrganizationMember, OrganizationRole, PendingInvitation } from '../../core/models';
import { OrganizationsService } from '../../core/organizations.service';

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

  constructor() {
    void this.load();

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
}
