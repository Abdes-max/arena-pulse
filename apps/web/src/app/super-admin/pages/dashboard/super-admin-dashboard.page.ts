import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminStats } from '../../core/models';

@Component({
  selector: 'app-super-admin-dashboard-page',
  imports: [],
  templateUrl: './super-admin-dashboard.page.html',
  styleUrl: './super-admin-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDashboardPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly stats = signal<SuperAdminStats | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.stats.set(await this.superAdminService.getStats());
    } catch {
      this.errorMessage.set('Impossible de charger les statistiques.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatAmount(amountCents: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
      amountCents / 100,
    );
  }
}
