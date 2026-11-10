import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Badge, Button, Select, SelectOption, TextField, TypeToConfirm } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminUserRow } from '../../core/models';
import { SuperAdminFilterBar } from '../../shared/filter-bar';
import { isInPeriod, matchesText, PERIOD_OPTIONS, PeriodFilter } from '../../shared/list-filters';
import { queryFilter } from '../../shared/query-filter';
import { matchesTestFilter, TEST_FILTER_OPTIONS } from '../../shared/list-filters';

@Component({
  selector: 'app-super-admin-users-page',
  imports: [Badge, Button, Select, TextField, TypeToConfirm, SuperAdminFilterBar],
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

  protected readonly query = queryFilter('q', '');
  protected readonly verification = queryFilter('verification', '');
  protected readonly organizationsFilter = queryFilter('organizations', '');
  protected readonly period = queryFilter<PeriodFilter>('period', 'all');
  protected readonly from = queryFilter('from', '');
  protected readonly to = queryFilter('to', '');

  protected readonly testScope = queryFilter('test', '');
  protected readonly testOptions = TEST_FILTER_OPTIONS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly verificationOptions: SelectOption[] = [
    { value: '', label: 'Vérifiés ou non' },
    { value: 'verified', label: 'Vérifié' },
    { value: 'unverified', label: 'Non vérifié' },
  ];
  protected readonly organizationsOptions: SelectOption[] = [
    { value: '', label: 'Avec ou sans organisation' },
    { value: 'with', label: 'Avec organisation' },
    { value: 'without', label: 'Sans organisation' },
  ];

  protected readonly filtered = computed(() =>
    this.users().filter(
      (user) =>
        matchesText(
          this.query(),
          user.firstName,
          user.lastName,
          user.email,
          ...user.organizations.map((org) => org.name),
        ) &&
        (!this.verification() || !!user.emailVerifiedAt === (this.verification() === 'verified')) &&
        (!this.organizationsFilter() ||
          user.organizations.length > 0 === (this.organizationsFilter() === 'with')) &&
        matchesTestFilter(user.isTest, this.testScope()) &&
        isInPeriod(user.createdAt, this.period(), this.from(), this.to()),
    ),
  );

  protected readonly filtersActive = computed(
    () =>
      !!(
        this.query() ||
        this.verification() ||
        this.organizationsFilter() ||
        this.testScope() ||
        this.period() !== 'all'
      ),
  );

  constructor() {
    void this.load();
  }

  protected resetFilters(): void {
    this.query.set('');
    this.verification.set('');
    this.organizationsFilter.set('');
    this.testScope.set('');
    this.period.set('all');
    this.from.set('');
    this.to.set('');
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
