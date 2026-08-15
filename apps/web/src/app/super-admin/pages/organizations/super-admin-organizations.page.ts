import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminOrganizationRow } from '../../core/models';

@Component({
  selector: 'app-super-admin-organizations-page',
  imports: [RouterLink, Badge],
  templateUrl: './super-admin-organizations.page.html',
  styleUrl: './super-admin-organizations.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminOrganizationsPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly organizations = signal<SuperAdminOrganizationRow[]>([]);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.organizations.set(await this.superAdminService.listOrganizations());
    } catch {
      this.errorMessage.set('Impossible de charger les organisations.');
    } finally {
      this.loading.set(false);
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
