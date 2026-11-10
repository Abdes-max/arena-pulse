import { SelectOption } from 'design-system';

export type PeriodFilter = 'all' | '7d' | '30d' | '365d' | 'custom';

export const PERIOD_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'Toutes les dates' },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: '365d', label: '12 derniers mois' },
  { value: 'custom', label: 'Période personnalisée' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '365d': 365 };

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Every word of the query must appear in one of the fields (accents and case ignored). */
export function matchesText(query: string, ...fields: (string | null | undefined)[]): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  const haystack = normalize(fields.filter(Boolean).join(' '));
  return tokens.every((token) => haystack.includes(token));
}

/**
 * `from` / `to` are YYYY-MM-DD dates (the custom range's date fields); the
 * preset periods ignore them. An unparseable date is treated as not set.
 */
export function isInPeriod(
  iso: string | null,
  period: PeriodFilter,
  from: string,
  to: string,
  now: number = Date.now(),
): boolean {
  if (period === 'all') {
    return true;
  }
  if (!iso) {
    return false;
  }
  const time = new Date(iso).getTime();
  if (period === 'custom') {
    const start = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return (
      time >= (Number.isNaN(start) ? Number.NEGATIVE_INFINITY : start) &&
      time <= (Number.isNaN(end) ? Number.POSITIVE_INFINITY : end)
    );
  }
  return time >= now - PRESET_DAYS[period] * DAY_MS;
}

/** Options of a "pick one" select, with a leading "all" choice. */
export function withAllOption(allLabel: string, options: SelectOption[]): SelectOption[] {
  return [{ value: '', label: allLabel }, ...options];
}

/** Distinct, sorted values of a column as select options. */
export function distinctOptions(values: readonly string[]): SelectOption[] {
  return [...new Set(values)]
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((value) => ({ value, label: value }));
}

/** "Données de test" filter of the lists: everything, hide the demo / test rows, or only those. */
export const TEST_FILTER_OPTIONS: SelectOption[] = [
  { value: '', label: 'Démo/test inclus' },
  { value: 'hide', label: 'Masquer démo/test' },
  { value: 'only', label: 'Seulement démo/test' },
];

export function matchesTestFilter(isTest: boolean, filter: string): boolean {
  if (filter === 'hide') {
    return !isTest;
  }
  return filter === 'only' ? isTest : true;
}

/** Address of a tournament's public site (same origin as the console). */
export function publicTournamentUrl(slug: string): string {
  return `${window.location.origin}/${slug}`;
}
