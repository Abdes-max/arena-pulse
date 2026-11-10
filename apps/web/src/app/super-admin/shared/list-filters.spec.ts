import { distinctOptions, isInPeriod, matchesTestFilter, matchesText } from './list-filters';

describe('matchesText', () => {
  it('matches everything on an empty query', () => {
    expect(matchesText('  ', 'Padel Club')).toBe(true);
  });

  it('ignores case and accents, and needs every word', () => {
    expect(matchesText('ÉCOLE foot', 'Ecole de Football')).toBe(true);
    expect(matchesText('ecole padel', 'Ecole de Football')).toBe(false);
  });

  it('searches across several fields and skips empty ones', () => {
    expect(matchesText('dupont lyon', 'Marie Dupont', null, 'FC Lyon')).toBe(true);
  });
});

describe('isInPeriod', () => {
  const now = new Date('2026-11-10T12:00:00').getTime();

  it('accepts anything for "all"', () => {
    expect(isInPeriod(null, 'all', '', '', now)).toBe(true);
  });

  it('applies the preset windows', () => {
    expect(isInPeriod('2026-11-05T10:00:00', '7d', '', '', now)).toBe(true);
    expect(isInPeriod('2026-10-20T10:00:00', '7d', '', '', now)).toBe(false);
    expect(isInPeriod('2026-10-20T10:00:00', '30d', '', '', now)).toBe(true);
  });

  it('rejects a missing date once a period is chosen', () => {
    expect(isInPeriod(null, '30d', '', '', now)).toBe(false);
  });

  it('applies a custom range, bounds included, and open-ended bounds', () => {
    expect(isInPeriod('2026-11-01T08:00:00', 'custom', '2026-11-01', '2026-11-03', now)).toBe(true);
    expect(isInPeriod('2026-11-03T23:00:00', 'custom', '2026-11-01', '2026-11-03', now)).toBe(true);
    expect(isInPeriod('2026-11-04T00:30:00', 'custom', '2026-11-01', '2026-11-03', now)).toBe(
      false,
    );
    expect(isInPeriod('2020-01-01T00:00:00', 'custom', '', '2026-11-03', now)).toBe(true);
    expect(isInPeriod('2026-10-01T00:00:00', 'custom', '2026-11-01', '', now)).toBe(false);
  });
});

describe('distinctOptions', () => {
  it('dedupes and sorts', () => {
    expect(distinctOptions(['Tennis', 'Padel', 'Tennis']).map((o) => o.value)).toEqual([
      'Padel',
      'Tennis',
    ]);
  });
});

describe('matchesTestFilter', () => {
  it('keeps everything, hides the test rows, or keeps only them', () => {
    expect(matchesTestFilter(true, '')).toBe(true);
    expect(matchesTestFilter(true, 'hide')).toBe(false);
    expect(matchesTestFilter(false, 'hide')).toBe(true);
    expect(matchesTestFilter(true, 'only')).toBe(true);
    expect(matchesTestFilter(false, 'only')).toBe(false);
  });
});
