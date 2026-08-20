import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Badge, Button, TypeToConfirm } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminUserRow } from '../../core/models';

@Component({
  selector: 'app-super-admin-users-page',
  imports: [Badge, Button, TypeToConfirm],
  templateUrl: './super-admin-users.page.html',
  styleUrl: './super-admin-users.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminUsersPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly users = signal<SuperAdminUserRow[]>([]);
  protected readonly verifying = signal<string | null>(null);

  // Which row has its inline "type SUPPRIMER to confirm" open -- same
  // one-at-a-time pattern as super-admin-payments.page's annotatingId.
  protected readonly deletingUserId = signal<string | null>(null);
  protected readonly deleting = signal(false);
  // Kept separate from errorMessage (used for the page-level load failure,
  // which replaces the whole table when set) so a delete failure can be
  // shown inline, next to the row, without hiding everything else.
  protected readonly deleteErrorMessage = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await this.superAdminService.listUsers());
    } catch {
      this.errorMessage.set('Impossible de charger les comptes.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async verifyEmail(user: SuperAdminUserRow): Promise<void> {
    if (this.verifying()) {
      return;
    }
    this.verifying.set(user.id);
    try {
      await this.superAdminService.verifyUserEmail(user.id);
      this.users.update((users) =>
        users.map((u) =>
          u.id === user.id ? { ...u, emailVerifiedAt: new Date().toISOString() } : u,
        ),
      );
    } catch {
      this.errorMessage.set("Impossible de vérifier l'email de ce compte.");
    } finally {
      this.verifying.set(null);
    }
  }

  protected startDeleting(user: SuperAdminUserRow): void {
    this.deletingUserId.set(user.id);
    this.deleteErrorMessage.set(null);
  }

  protected cancelDeleting(): void {
    this.deletingUserId.set(null);
    this.deleteErrorMessage.set(null);
  }

  protected async deleteUser(user: SuperAdminUserRow): Promise<void> {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.deleteErrorMessage.set(null);
    try {
      // ap-type-to-confirm only emits (confirm) once the user has typed its
      // confirmWord (default "SUPPRIMER") -- safe to send literally here.
      await this.superAdminService.deleteUser(user.id, 'SUPPRIMER');
      this.users.update((users) => users.filter((u) => u.id !== user.id));
      this.deletingUserId.set(null);
    } catch {
      this.deleteErrorMessage.set(
        `Impossible de supprimer ce compte : c'est peut-être la seule personne administratrice d'une organisation ayant d'autres membres.`,
      );
    } finally {
      this.deleting.set(false);
    }
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
