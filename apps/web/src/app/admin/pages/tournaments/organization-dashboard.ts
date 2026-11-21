import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { OrganizationDashboardStats } from '../../core/models';
import { StatsService } from '../../core/stats.service';
import { StatsBars, StatsColumns, StatsDatum, StatsSegments } from 'design-system';

const COLLAPSED_STORAGE_KEY = 'arena-pulse:org-dashboard-collapsed';

/**
 * Organization-wide KPI strip shown above the tournament list -- the
 * "how is my season going" view. Best-effort like the setup guide:
 * a failed load just hides the block, it never blocks the list below it.
 */
@Component({
  selector: 'app-organization-dashboard',
  imports: [DecimalPipe, RouterLink, StatsBars, StatsColumns, StatsSegments, TranslocoPipe],
  templateUrl: './organization-dashboard.html',
  styleUrls: ['../../shared/stats-dashboard.scss', './organization-dashboard.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationDashboard implements OnInit {
  readonly organizationId = input.required<string>();

  private readonly statsService = inject(StatsService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly stats = signal<OrganizationDashboardStats | null>(null);
  protected readonly collapsed = signal(readCollapsed());

  protected readonly monthColumns = computed<StatsDatum[]>(() => {
    const lang = this.languageService.language();
    return (this.stats()?.matchesPlayedByMonth ?? []).map(({ month, count }) => ({
      label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString(lang, {
        month: 'short',
        timeZone: 'UTC',
      }),
      value: count,
    }));
  });

  protected readonly statusSegments = computed<StatsDatum[]>(() => {
    const byStatus = this.stats()?.tournaments.byStatus;
    if (!byStatus) {
      return [];
    }
    const lang = this.languageService.language();
    const t = (key: string) =>
      this.transloco.translate(`admin.tournamentList.status.${key}`, {}, lang);
    return [
      { label: t('published'), value: byStatus.PUBLISHED, tone: 'success' },
      { label: t('draft'), value: byStatus.DRAFT, tone: 'primary' },
      { label: t('unpublished'), value: byStatus.UNPUBLISHED, tone: 'warning' },
      { label: t('archived'), value: byStatus.ARCHIVED, tone: 'muted' },
    ];
  });

  protected readonly tournamentBars = computed<StatsDatum[]>(() => {
    const lang = this.languageService.language();
    return (this.stats()?.topTournaments ?? []).map((tournament) => ({
      label: tournament.name,
      value: tournament.teamsCount,
      hint: this.transloco.translate(
        'admin.dashboard.matchesProgress',
        { played: tournament.matchesPlayed, total: tournament.matchesTotal },
        lang,
      ),
    }));
  });

  async ngOnInit(): Promise<void> {
    try {
      this.stats.set(await this.statsService.getOrganizationStats(this.organizationId()));
    } catch {
      // Best-effort, see the class comment.
    }
  }

  protected toggle(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Storage can be unavailable (private mode) -- the toggle still works for this visit.
    }
  }

  protected formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.languageService.language(), {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.languageService.language(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
