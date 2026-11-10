import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, BadgeStatus, Select, SelectOption, TextField } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminTournamentRow } from '../../core/models';
import { SuperAdminFilterBar } from '../../shared/filter-bar';
import {
  distinctOptions,
  isInPeriod,
  matchesText,
  PERIOD_OPTIONS,
  PeriodFilter,
  withAllOption,
} from '../../shared/list-filters';
import { isTournamentPast } from 'shared-models';
import { publicTournamentUrl } from '../../shared/list-filters';
import { queryFilter } from '../../shared/query-filter';
import { matchesTestFilter, TEST_FILTER_OPTIONS } from '../../shared/list-filters';

const STATUS_TO_BADGE: Record<string, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

@Component({
  selector: 'app-super-admin-tournaments-page',
  imports: [RouterLink, Badge, Select, TextField, SuperAdminFilterBar],
  templateUrl: './super-admin-tournaments.page.html',
  styleUrl: './super-admin-tournaments.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminTournamentsPage {
  private readonly superAdminService = inject(SuperAdminService);

  protected readonly statusBadge = STATUS_TO_BADGE;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly tournaments = signal<SuperAdminTournamentRow[]>([]);

  protected readonly query = queryFilter('q', '');
  protected readonly status = queryFilter('status', '');
  protected readonly sport = queryFilter('sport', '');
  protected readonly organization = queryFilter('organization', '');
  protected readonly played = queryFilter('played', '');
  protected readonly time = queryFilter('time', '');
  protected readonly period = queryFilter<PeriodFilter>('period', 'all');
  protected readonly from = queryFilter('from', '');
  protected readonly to = queryFilter('to', '');

  protected readonly testScope = queryFilter('test', '');
  protected readonly testOptions = TEST_FILTER_OPTIONS;
  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly statusOptions: SelectOption[] = [
    { value: '', label: 'Tous les statuts' },
    { value: 'DRAFT', label: 'Brouillon' },
    { value: 'PUBLISHED', label: 'Publié' },
    { value: 'UNPUBLISHED', label: 'Dépublié' },
    { value: 'ARCHIVED', label: 'Archivé' },
  ];
  protected readonly timeOptions: SelectOption[] = [
    { value: '', label: 'À venir et passés' },
    { value: 'upcoming', label: 'À venir' },
    { value: 'past', label: 'Passés' },
  ];
  protected readonly playedOptions: SelectOption[] = [
    { value: '', label: 'Avec ou sans match joué' },
    { value: 'with', label: 'Avec matchs joués' },
    { value: 'without', label: 'Sans match joué' },
  ];
  protected readonly sportOptions = computed(() =>
    withAllOption('Tous les sports', distinctOptions(this.tournaments().map((t) => t.sportName))),
  );
  protected readonly organizationOptions = computed(() => {
    const byId = new Map(this.tournaments().map((t) => [t.organizationId, t.organizationName]));
    const options = [...byId].map(([value, label]) => ({ value, label }));
    options.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return withAllOption('Toutes les organisations', options);
  });

  protected readonly filtered = computed(() =>
    this.tournaments().filter(
      (tournament) =>
        matchesText(this.query(), tournament.name, tournament.organizationName) &&
        (!this.status() || tournament.status === this.status()) &&
        (!this.sport() || tournament.sportName === this.sport()) &&
        (!this.organization() || tournament.organizationId === this.organization()) &&
        (!this.time() || isTournamentPast(tournament) === (this.time() === 'past')) &&
        (!this.played() || tournament.matchesPlayedCount > 0 === (this.played() === 'with')) &&
        matchesTestFilter(tournament.organizationIsTest, this.testScope()) &&
        isInPeriod(tournament.createdAt, this.period(), this.from(), this.to()),
    ),
  );

  protected readonly filtersActive = computed(
    () =>
      !!(
        this.query() ||
        this.status() ||
        this.sport() ||
        this.organization() ||
        this.played() ||
        this.time() ||
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
      this.tournaments.set(await this.superAdminService.listTournaments());
    } catch {
      this.errorMessage.set('Impossible de charger les tournois.');
    } finally {
      this.loading.set(false);
    }
  }

  protected formatDates(tournament: SuperAdminTournamentRow): string {
    const format = (iso: string) =>
      new Date(iso).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    if (!tournament.startDate) {
      return '-';
    }
    const start = format(tournament.startDate);
    const end = tournament.endDate ? format(tournament.endDate) : start;
    return end === start ? start : `${start} au ${end}`;
  }

  protected publicUrl(slug: string): string {
    return publicTournamentUrl(slug);
  }

  protected resetFilters(): void {
    this.query.set('');
    this.status.set('');
    this.sport.set('');
    this.organization.set('');
    this.played.set('');
    this.time.set('');
    this.testScope.set('');
    this.period.set('all');
    this.from.set('');
    this.to.set('');
  }
}
