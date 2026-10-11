import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LanguageService } from 'design-tokens';
import { TournamentWrapped, WrappedMatchHighlight, WrappedNamedCount } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

/** One rendered slice of a pie/donut chart -- pre-computed SVG arc path plus its legend row. */
interface ChartSlice {
  label: string;
  value: number;
  percent: number;
  color: string;
  path: string;
}

/** One rendered row of a ranking bar chart (top attack/defense, matches-by-hour). */
interface BarRow {
  label: string;
  value: number;
  widthPercent: number;
}

// Reference palette slots (see the dataviz skill's palette.md) -- used only
// for the two categorical charts below (match outcomes, venues), never for
// the site's own brand/theme colors. Both modes pass the palette
// validator's adjacent-pair check against a light and a dark surface.
const CATEGORICAL_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const CATEGORICAL_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

@Component({
  selector: 'app-wrapped-page',
  imports: [DecimalPipe, TranslocoPipe],
  templateUrl: './wrapped.page.html',
  styleUrl: './wrapped.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WrappedPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  protected readonly language = this.languageService.language;

  protected readonly loading = signal(true);
  protected readonly wrapped = signal<TournamentWrapped | null>(null);

  protected readonly unlocked = computed(() => this.wrapped()?.unlocked === true);
  // Only meaningful once `unlocked()` is true -- narrows the union for the
  // template, which otherwise can't access any field but `unlocked` itself.
  protected readonly data = computed(() => {
    const w = this.wrapped();
    return w?.unlocked ? w : null;
  });

  protected readonly outcomeSlices = computed<ChartSlice[]>(() => {
    const outcomes = this.data()?.outcomes;
    if (!outcomes) {
      return [];
    }
    const lang = this.language();
    const t = (key: string) => this.transloco.translate(key, {}, lang);
    return this.buildSlices([
      { label: t('wrapped.outcomes.homeWin'), value: outcomes.homeWin },
      { label: t('wrapped.outcomes.awayWin'), value: outcomes.awayWin },
      { label: t('wrapped.outcomes.draw'), value: outcomes.draw },
      { label: t('wrapped.outcomes.shootout'), value: outcomes.shootout },
    ]);
  });

  protected readonly venueSlices = computed<ChartSlice[]>(() =>
    this.buildSlices(
      (this.data()?.venues ?? []).map((venue: WrappedNamedCount) => ({
        label: venue.name,
        value: venue.count,
      })),
    ),
  );

  protected readonly hourBars = computed<BarRow[]>(() => {
    const slots = this.data()?.matchesByHour ?? [];
    const max = Math.max(1, ...slots.map((slot) => slot.count));
    return slots.map((slot) => ({
      label: `${slot.name}h`,
      value: slot.count,
      widthPercent: (slot.count / max) * 100,
    }));
  });

  protected readonly attackBars = computed<BarRow[]>(() =>
    this.rankingBars(this.data()?.topAttack),
  );
  protected readonly defenseBars = computed<BarRow[]>(() =>
    this.rankingBars(this.data()?.topDefense),
  );

  // Rounded once here rather than in the template -- findBiggestUpset
  // already guarantees loserRatingBefore > winnerRatingBefore whenever it
  // returns a result, so this is always a positive whole number.
  protected readonly upsetGap = computed(() => {
    const upset = this.data()?.level.biggestUpset;
    return upset ? Math.round(upset.loserRatingBefore - upset.winnerRatingBefore) : 0;
  });

  constructor() {
    effect(() => {
      const slug = this.context.slug();
      if (slug) {
        void this.load(slug);
      }
    });
    // A score change (validation, correction) can shift every stat here --
    // same "just refetch" pattern as standings.page.ts/schedule.page.ts.
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.load(this.context.slug());
      }
    });
  }

  private async load(slug: string): Promise<void> {
    this.loading.set(true);
    try {
      this.wrapped.set(await this.api.getWrapped(slug));
    } finally {
      this.loading.set(false);
    }
  }

  protected matchLabel(match: WrappedMatchHighlight): string {
    const penalties =
      match.homePenaltyScore !== null && match.awayPenaltyScore !== null
        ? ` (${match.homePenaltyScore}-${match.awayPenaltyScore} t.a.b.)`
        : '';
    return `${match.homeTeamName} ${match.homeScore}-${match.awayScore}${penalties} ${match.awayTeamName}`;
  }

  protected formatDate(value: string | null): string | null {
    return value ? new Date(value).toLocaleDateString(this.language()) : null;
  }

  private rankingBars(rows: { teamName: string; goals: number }[] | undefined): BarRow[] {
    if (!rows || rows.length === 0) {
      return [];
    }
    const max = Math.max(...rows.map((row) => row.goals), 1);
    return rows.map((row) => ({
      label: row.teamName,
      value: row.goals,
      widthPercent: (row.goals / max) * 100,
    }));
  }

  private buildSlices(entries: { label: string; value: number }[]): ChartSlice[] {
    const nonZero = entries.filter((entry) => entry.value > 0);
    const total = nonZero.reduce((sum, entry) => sum + entry.value, 0);
    if (total === 0) {
      return [];
    }
    // ThemeService always stamps data-mode explicitly (never left unset --
    // see design-tokens' ThemeMode/DEFAULT_MODE), so this alone is enough,
    // no prefers-color-scheme fallback needed.
    const dark = document.documentElement.dataset['mode'] === 'dark';
    const palette = dark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;

    let angle = 0;
    return nonZero.map((entry, index) => {
      const sweep = (entry.value / total) * 360;
      const path = arcPath(angle, angle + sweep);
      angle += sweep;
      return {
        label: entry.label,
        value: entry.value,
        percent: Math.round((entry.value / total) * 100),
        color: palette[index % palette.length],
        path,
      };
    });
  }
}

function polar(angle: number, radius: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180;
  return [50 + radius * Math.cos(rad), 50 + radius * Math.sin(rad)];
}

function arcPath(startAngle: number, endAngle: number): string {
  const large = endAngle - startAngle > 180 ? 1 : 0;
  const [x0, y0] = polar(endAngle, 46);
  const [x1, y1] = polar(startAngle, 46);
  return `M 50 50 L ${x0} ${y0} A 46 46 0 ${large} 0 ${x1} ${y1} Z`;
}
