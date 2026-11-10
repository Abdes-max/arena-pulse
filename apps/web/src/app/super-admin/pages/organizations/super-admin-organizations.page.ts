import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, Select, SelectOption, TextField } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminOrganizationRow } from '../../core/models';
import { SuperAdminFilterBar } from '../../shared/filter-bar';
import { isInPeriod, matchesText, PERIOD_OPTIONS, PeriodFilter } from '../../shared/list-filters';
import { queryFilter } from '../../shared/query-filter';
import { matchesTestFilter, TEST_FILTER_OPTIONS } from '../../shared/list-filters';

@Component({
  selector: 'app-super-admin-organizations-page',
  imports: [RouterLink, Badge, Select, TextField, SuperAdminFilterBar],
  templateUrl: './super-admin-organizations.page.html',
  styleUrl: './super-admin-organizations.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminOrganizationsPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly organizations = signal<SuperAdminOrganizationRow[]>([]);

  protected readonly query = queryFilter('q', '');
  protected readonly subscription = queryFilter('subscription', '');
  protected readonly status = queryFilter('status', '');
  protected readonly tournamentsFilter = queryFilter('tournaments', '');
  protected readonly period = queryFilter<PeriodFilter>('period', 'all');
  protected readonly from = queryFilter('from', '');
  protected readonly to = queryFilter('to', '');

  protected readonly testScope = queryFilter('test', '');
  protected readonly testOptions = TEST_FILTER_OPTIONS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly subscriptionOptions: SelectOption[] = [
    { value: '', label: 'Tous les abonnements' },
    { value: 'ACTIVE', label: 'Abonnement actif' },
    { value: 'NONE', label: 'Sans abonnement' },
  ];
  protected readonly statusOptions: SelectOption[] = [
    { value: '', label: 'Tous les statuts' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspendue' },
  ];
  protected readonly tournamentsOptions: SelectOption[] = [
    { value: '', label: 'Avec ou sans tournoi' },
    { value: 'with', label: 'Avec tournois' },
    { value: 'without', label: 'Sans tournoi' },
  ];

  protected readonly filtered = computed(() =>
    this.organizations().filter(
      (organization) =>
        matchesText(this.query(), organization.name) &&
        (!this.subscription() || organization.subscriptionStatus === this.subscription()) &&
        (!this.status() || (organization.suspendedAt ? 'suspended' : 'active') === this.status()) &&
        (!this.tournamentsFilter() ||
          organization.tournamentsCount > 0 === (this.tournamentsFilter() === 'with')) &&
        matchesTestFilter(organization.isTest, this.testScope()) &&
        isInPeriod(organization.createdAt, this.period(), this.from(), this.to()),
    ),
  );

  protected readonly filtersActive = computed(
    () =>
      !!(
        this.query() ||
        this.subscription() ||
        this.status() ||
        this.tournamentsFilter() ||
        this.testScope() ||
        this.period() !== 'all'
      ),
  );

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

  protected resetFilters(): void {
    this.query.set('');
    this.subscription.set('');
    this.status.set('');
    this.tournamentsFilter.set('');
    this.testScope.set('');
    this.period.set('all');
    this.from.set('');
    this.to.set('');
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
