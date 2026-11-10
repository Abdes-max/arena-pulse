import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Select, TextField } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminStats } from '../../core/models';
import { PERIOD_OPTIONS, PeriodFilter } from '../../shared/list-filters';
import { queryFilter } from '../../shared/query-filter';

@Component({
  selector: 'app-super-admin-dashboard-page',
  imports: [Select, TextField],
  templateUrl: './super-admin-dashboard.page.html',
  styleUrl: './super-admin-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDashboardPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly stats = signal<SuperAdminStats | null>(null);

  protected readonly period = queryFilter<PeriodFilter>('period', 'all');
  protected readonly from = queryFilter('from', '');
  protected readonly to = queryFilter('to', '');
  protected readonly periodOptions = PERIOD_OPTIONS;
  /** Whether the figures cover a window rather than everything (wording changes). */
  protected readonly windowed = computed(() => this.stats()?.period != null);

  // Latest request wins: a slow answer for a previous period must not
  // overwrite the figures of the one now selected.
  private requestId = 0;

  constructor() {
    effect(() => {
      const period = this.period();
      const from = this.from();
      const to = this.to();
      void this.load(period, from, to);
    });
  }

  private async load(period: PeriodFilter, from: string, to: string): Promise<void> {
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.errorMessage.set(null);
    const params: Record<string, string> = {};
    if (period !== 'all') {
      params['period'] = period;
    }
    if (period === 'custom' && from) {
      params['from'] = from;
    }
    if (period === 'custom' && to) {
      params['to'] = to;
    }
    try {
      const stats = await this.superAdminService.getStats(params);
      if (requestId === this.requestId) {
        this.stats.set(stats);
      }
    } catch {
      if (requestId === this.requestId) {
        this.errorMessage.set('Impossible de charger les statistiques.');
      }
    } finally {
      if (requestId === this.requestId) {
        this.loading.set(false);
      }
    }
  }

  protected formatAmount(amountCents: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
      amountCents / 100,
    );
  }
}
