import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Badge, Button, TypeToConfirm } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminOrganizationDetail } from '../../core/models';

@Component({
  selector: 'app-super-admin-organization-detail-page',
  imports: [RouterLink, Badge, Button, TypeToConfirm],
  templateUrl: './super-admin-organization-detail.page.html',
  styleUrl: './super-admin-organization-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminOrganizationDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly superAdminService = inject(SuperAdminService);

  private readonly organizationId = this.route.snapshot.paramMap.get('organizationId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly organization = signal<SuperAdminOrganizationDetail | null>(null);
  protected readonly toggling = signal(false);

  // Danger zone: collapsed by default, same in-page-reveal pattern as
  // feat/171's account-deletion pages -- no modal dialog exists in this
  // app.
  protected readonly dangerZoneOpen = signal(false);
  protected readonly deleting = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.organization.set(await this.superAdminService.getOrganization(this.organizationId));
    } catch {
      this.errorMessage.set('Impossible de charger cette organisation.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async suspend(): Promise<void> {
    if (this.toggling()) {
      return;
    }
    this.toggling.set(true);
    try {
      await this.superAdminService.suspendOrganization(this.organizationId);
      await this.load();
    } catch {
      this.errorMessage.set('Impossible de suspendre cette organisation.');
    } finally {
      this.toggling.set(false);
    }
  }

  protected async reactivate(): Promise<void> {
    if (this.toggling()) {
      return;
    }
    this.toggling.set(true);
    try {
      await this.superAdminService.reactivateOrganization(this.organizationId);
      await this.load();
    } catch {
      this.errorMessage.set('Impossible de réactiver cette organisation.');
    } finally {
      this.toggling.set(false);
    }
  }

  protected openDangerZone(): void {
    this.dangerZoneOpen.set(true);
  }

  protected cancelDeletion(): void {
    this.dangerZoneOpen.set(false);
    this.errorMessage.set(null);
  }

  protected async deleteOrganization(): Promise<void> {
    if (this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      // ap-type-to-confirm only emits (confirm) once the user has typed its
      // confirmWord (default "SUPPRIMER") -- safe to send literally here.
      await this.superAdminService.deleteOrganization(this.organizationId, 'SUPPRIMER');
      await this.router.navigate(['/super-admin/organizations']);
    } catch {
      this.errorMessage.set('Impossible de supprimer cette organisation.');
    } finally {
      this.deleting.set(false);
    }
  }
}
