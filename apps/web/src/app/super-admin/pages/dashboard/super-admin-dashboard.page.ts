import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, BadgeStatus, Select, SelectOption, TextField } from 'design-system';
import { SuperAdminService } from '../../core/super-admin.service';
import { SuperAdminStats, SuperAdminTournamentStatus } from '../../core/models';
import { PERIOD_OPTIONS, PeriodFilter, publicTournamentUrl } from '../../shared/list-filters';
import { queryFilter } from '../../shared/query-filter';

interface KpiCard {
  label: string;
  value: string;
  detail: string | null;
  link: string | null;
  queryParams: Record<string, string>;
  accent?: 'revenue';
}

const STATUS_ROWS: { status: SuperAdminTournamentStatus; label: string; badge: BadgeStatus }[] = [
  { status: 'PUBLISHED', label: 'Publiés', badge: 'published' },
  { status: 'DRAFT', label: 'Brouillons', badge: 'draft' },
  { status: 'UNPUBLISHED', label: 'Dépubliés', badge: 'unpublished' },
  { status: 'ARCHIVED', label: 'Archivés', badge: 'archived' },
];

@Component({
  selector: 'app-super-admin-dashboard-page',
  imports: [RouterLink, Badge, Select, TextField],
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
  /** '' = real customers only, 'all' = demo / test data included too. */
  protected readonly scope = queryFilter('scope', '');

  protected readonly periodOptions = PERIOD_OPTIONS;
  protected readonly scopeOptions: SelectOption[] = [
    { value: '', label: 'Clients réels' },
    { value: 'all', label: 'Avec démo/test' },
  ];
  protected readonly statusRows = STATUS_ROWS;

  /** Whether the figures cover a window rather than everything (wording changes). */
  protected readonly windowed = computed(() => this.stats()?.period != null);

  // Every card links to the matching list, carrying the demo/test scope so
  // the list shows the same rows the figure counted.
  private readonly testParam = computed<Record<string, string>>(() =>
    this.scope() === 'all' ? ({} as Record<string, string>) : { test: 'hide' },
  );

  protected readonly cards = computed<KpiCard[]>(() => {
    const s = this.stats();
    if (!s) {
      return [];
    }
    const windowed = this.windowed();
    const test = this.testParam();
    const suspended = s.organizations.suspended;
    return [
      {
        label: windowed ? 'Nouveaux comptes' : 'Comptes organisateurs',
        value: String(s.users.total),
        detail: `${s.users.verified} vérifiés · ${s.users.unverified} non vérifiés`,
        link: '/super-admin/users',
        queryParams: test,
      },
      {
        label: windowed ? 'Nouvelles organisations' : 'Organisations',
        value: String(s.organizations.total),
        detail:
          suspended > 0 ? `${suspended} suspendue${suspended > 1 ? 's' : ''}` : 'Aucune suspendue',
        link: '/super-admin/organizations',
        queryParams: test,
      },
      {
        label: 'Abonnements actifs',
        value: String(s.subscriptions.active),
        detail: windowed ? 'à ce jour' : null,
        link: '/super-admin/organizations',
        queryParams: { ...test, subscription: 'ACTIVE' },
      },
      {
        label: windowed ? 'Tournois créés' : 'Tournois',
        value: String(s.tournaments.total),
        detail: `${s.tournaments.byStatus.PUBLISHED} publié${s.tournaments.byStatus.PUBLISHED > 1 ? 's' : ''}`,
        link: '/super-admin/tournaments',
        queryParams: test,
      },
      {
        label: 'Équipes',
        value: String(s.teams),
        detail: null,
        link: null,
        queryParams: {},
      },
      {
        label: 'Matchs joués',
        value: String(s.matches.played),
        detail: `${s.matches.toPlay} à jouer`,
        link: '/super-admin/tournaments',
        queryParams: { ...test, played: 'with' },
      },
      {
        label: 'Inscriptions payées',
        value: String(s.registrations.paid),
        detail: null,
        link: '/super-admin/payments',
        queryParams: { ...test, type: 'REGISTRATION', status: 'paid' },
      },
      {
        label: windowed ? 'Revenu collecté sur la période' : 'Revenu total collecté',
        value: this.formatAmount(s.revenue.totalCents),
        detail: [
          `Publications ${this.formatAmount(s.revenue.publicationCents)}`,
          `Abonnements ${this.formatAmount(s.revenue.subscriptionCents)}`,
          `Inscriptions ${this.formatAmount(s.revenue.registrationCents)}`,
        ].join(' · '),
        link: '/super-admin/payments',
        queryParams: { ...test, status: 'paid' },
        accent: 'revenue',
      },
    ];
  });

  /** Query params of a list link for one tournament status. */
  protected statusQuery(status: SuperAdminTournamentStatus): Record<string, string> {
    return { ...this.testParam(), status };
  }

  protected testQuery(): Record<string, string> {
    return this.testParam();
  }

  protected readonly testBannerQuery = { test: 'only' };

  // Latest request wins: a slow answer for a previous selection must not
  // overwrite the figures of the one now selected.
  private requestId = 0;

  constructor() {
    effect(() => {
      void this.load(this.period(), this.from(), this.to(), this.scope());
    });
  }

  private async load(period: PeriodFilter, from: string, to: string, scope: string): Promise<void> {
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
    if (scope === 'all') {
      params['includeTest'] = 'true';
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

  protected badgeOf(status: SuperAdminTournamentStatus): BadgeStatus {
    return STATUS_ROWS.find((row) => row.status === status)?.badge ?? 'draft';
  }

  protected publicUrl(slug: string): string {
    return publicTournamentUrl(slug);
  }

  protected formatAmount(amountCents: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
      amountCents / 100,
    );
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
