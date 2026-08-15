import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Badge, Button } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminUserRow } from '../../core/models';

@Component({
  selector: 'app-super-admin-users-page',
  imports: [Badge, Button],
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

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
