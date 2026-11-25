import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import type { StatsMatchHighlight, TournamentDashboardStats } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { OrganizerStatsService } from '../../core/stats.service';
import { Logo, StatsBars, StatsColumns, StatsDatum, StatsRing, StatsSegments } from 'design-system';

// Native port of apps/web/src/app/admin/pages/stats/tournament-stats.page.ts
// -- same endpoint and shared chart primitives (design-system), laid out
// for a phone. Only validated scores feed the goal/team figures.
@Component({
  selector: 'app-organizer-stats-page',
  imports: [
    Logo,
    DecimalPipe,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    RouterLink,
    StatsBars,
    StatsColumns,
    StatsRing,
    StatsSegments,
    TranslocoPipe,
  ],
  templateUrl: './stats.page.html',
  styleUrls: ['./stats-dashboard.scss', './stats.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerStatsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(OrganizerAuthService);
  private readonly statsService = inject(OrganizerStatsService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly tournamentId = this.route.snapshot.paramMap.get('id')!;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly stats = signal<TournamentDashboardStats | null>(null);

  private t(key: string, params: Record<string, unknown> = {}): string {
    return this.transloco.translate(
      `organizer.stats.${key}`,
      params,
      this.languageService.language(),
    );
  }

  protected readonly statusSegments = computed<StatsDatum[]>(() => {
    const byStatus = this.stats()?.matches.byStatus;
    if (!byStatus) {
      return [];
    }
    this.languageService.language();
    return [
      { label: this.t('status.completed'), value: byStatus.COMPLETED, tone: 'success' },
      { label: this.t('status.live'), value: byStatus.LIVE, tone: 'signal' },
      { label: this.t('status.scheduled'), value: byStatus.SCHEDULED, tone: 'primary' },
      { label: this.t('status.postponed'), value: byStatus.POSTPONED, tone: 'warning' },
      {
        label: this.t('status.cancelled'),
        value: byStatus.CANCELLED + byStatus.FORFEITED,
        tone: 'muted',
      },
    ];
  });

  protected readonly outcomeSegments = computed<StatsDatum[]>(() => {
    const outcomes = this.stats()?.outcomes;
    if (!outcomes) {
      return [];
    }
    this.languageService.language();
    return [
      { label: this.t('outcomes.homeWin'), value: outcomes.homeWin, tone: 'primary' },
      { label: this.t('outcomes.awayWin'), value: outcomes.awayWin, tone: 'signal' },
      { label: this.t('outcomes.draw'), value: outcomes.draw, tone: 'muted' },
      { label: this.t('outcomes.shootout'), value: outcomes.shootout, tone: 'warning' },
    ];
  });

  protected readonly attackBars = computed<StatsDatum[]>(() => {
    this.languageService.language();
    return (this.stats()?.topAttack ?? []).map((row) => ({
      label: row.teamName,
      value: row.goals,
      hint: this.t('matchesCount', { count: row.matchesPlayed }),
    }));
  });

  protected readonly defenseBars = computed<StatsDatum[]>(() => {
    this.languageService.language();
    return (this.stats()?.topDefense ?? []).map((row) => ({
      label: row.teamName,
      value: row.goals,
      hint: this.t('matchesCount', { count: row.matchesPlayed }),
    }));
  });

  protected readonly hourColumns = computed<StatsDatum[]>(() =>
    (this.stats()?.matchesByHour ?? []).map((row) => ({ label: `${row.name}h`, value: row.count })),
  );

  protected readonly fieldBars = computed<StatsDatum[]>(() =>
    (this.stats()?.fields ?? []).map((row) => ({ label: row.name, value: row.count })),
  );

  protected readonly categoryBars = computed<StatsDatum[]>(() =>
    (this.stats()?.teamsByCategory ?? []).map((row) => ({ label: row.name, value: row.count })),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const organizationId = this.auth.organizations()[0]?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    try {
      this.stats.set(await this.statsService.getTournamentStats(organizationId, this.tournamentId));
    } catch {
      this.errorMessage.set('organizer.stats.errorLoad');
    } finally {
      this.loading.set(false);
    }
  }

  protected async goBack(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }

  protected scoreLine(match: StatsMatchHighlight): string {
    const penalties =
      match.homePenaltyScore !== null && match.awayPenaltyScore !== null
        ? ` ${this.t('penalties', { home: match.homePenaltyScore, away: match.awayPenaltyScore })}`
        : '';
    return `${match.homeTeamName} ${match.homeScore}-${match.awayScore} ${match.awayTeamName}${penalties}`;
  }

  protected formatAmount(cents: number, currency: string): string {
    return new Intl.NumberFormat(this.languageService.language(), {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  }
}
