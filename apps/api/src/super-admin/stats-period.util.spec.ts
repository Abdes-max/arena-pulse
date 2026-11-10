import { dateFilter, resolveStatsRange } from './stats-period.util';

describe('resolveStatsRange', () => {
  const now = new Date('2026-11-10T12:00:00.000Z');

  it('has no window for "all" or when no period is given', () => {
    expect(resolveStatsRange(undefined, undefined, undefined, now)).toBeNull();
    expect(resolveStatsRange('all', '2026-11-01', undefined, now)).toBeNull();
  });

  it('covers the last N days up to now for a preset', () => {
    const range = resolveStatsRange('7d', undefined, undefined, now);
    expect(range?.from?.toISOString()).toBe('2026-11-03T12:00:00.000Z');
    expect(range?.to).toBeNull();
  });

  it('takes whole days for a custom range, either bound optional', () => {
    const range = resolveStatsRange('custom', '2026-11-01', '2026-11-03', now);
    expect(range?.from?.getTime()).toBe(
      new Date('2026-11-01T00:00:00.000').getTime(),
    );
    expect(range?.to?.getTime()).toBe(
      new Date('2026-11-03T23:59:59.999').getTime(),
    );
    expect(
      resolveStatsRange('custom', undefined, '2026-11-03', now)?.from,
    ).toBeNull();
  });

  it('is the same as "all" for a custom range with no date', () => {
    expect(resolveStatsRange('custom', undefined, undefined, now)).toBeNull();
  });
});

describe('dateFilter', () => {
  it('is undefined without a range and only sets the bounds that exist', () => {
    expect(dateFilter(null)).toBeUndefined();
    const from = new Date('2026-11-01T00:00:00.000Z');
    expect(dateFilter({ from, to: null })).toEqual({ gte: from });
  });
});
