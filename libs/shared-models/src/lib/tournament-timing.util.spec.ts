import { isTournamentPast } from './tournament-timing.util';

const NOW = new Date('2026-10-14T12:00:00.000Z');

describe('isTournamentPast', () => {
  it('is past once the endDate is before today', () => {
    expect(isTournamentPast({ startDate: null, endDate: '2026-10-01T00:00:00.000Z' }, NOW)).toBe(
      true,
    );
  });

  it('is not past while the endDate is today or later', () => {
    expect(isTournamentPast({ startDate: null, endDate: '2026-10-14T00:00:00.000Z' }, NOW)).toBe(
      false,
    );
    expect(isTournamentPast({ startDate: null, endDate: '2026-12-25T00:00:00.000Z' }, NOW)).toBe(
      false,
    );
  });

  it('falls back to the startDate when there is no endDate (one-day events)', () => {
    expect(isTournamentPast({ startDate: '2026-09-01T00:00:00.000Z', endDate: null }, NOW)).toBe(
      true,
    );
    expect(isTournamentPast({ startDate: '2026-11-20T00:00:00.000Z', endDate: null }, NOW)).toBe(
      false,
    );
  });

  it('keeps an undated tournament in the upcoming list', () => {
    expect(isTournamentPast({ startDate: null, endDate: null }, NOW)).toBe(false);
  });
});
