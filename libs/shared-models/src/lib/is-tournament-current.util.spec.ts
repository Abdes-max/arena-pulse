import { isTournamentCurrentOrUpcoming } from './is-tournament-current.util';

const NOW = new Date('2026-10-14T12:00:00.000Z');

describe('isTournamentCurrentOrUpcoming', () => {
  it('keeps a tournament whose endDate is still today or later', () => {
    expect(
      isTournamentCurrentOrUpcoming(
        { startDate: null, endDate: '2026-10-14T00:00:00.000Z', lastMatchDate: null },
        NOW,
      ),
    ).toBe(true);
    expect(
      isTournamentCurrentOrUpcoming(
        { startDate: null, endDate: '2026-12-25T00:00:00.000Z', lastMatchDate: null },
        NOW,
      ),
    ).toBe(true);
  });

  it('drops a tournament whose endDate has already passed', () => {
    // A full day before NOW, not just a few hours -- the implementation
    // compares in local time (setHours(0, 0, 0, 0) on a Date), so a value
    // merely hours earlier than NOW could still land on "today" depending
    // on the test runner's own timezone offset from the UTC NOW above.
    expect(
      isTournamentCurrentOrUpcoming(
        { startDate: null, endDate: '2026-10-12T12:00:00.000Z', lastMatchDate: null },
        NOW,
      ),
    ).toBe(false);
  });

  it('falls back to lastMatchDate when there is no endDate', () => {
    expect(
      isTournamentCurrentOrUpcoming(
        { startDate: null, endDate: null, lastMatchDate: '2026-10-12T10:20:00.000Z' },
        NOW,
      ),
    ).toBe(false);
    expect(
      isTournamentCurrentOrUpcoming(
        { startDate: null, endDate: null, lastMatchDate: '2026-10-14T10:20:00.000Z' },
        NOW,
      ),
    ).toBe(true);
  });

  it('drops a tournament with no date information at all', () => {
    expect(
      isTournamentCurrentOrUpcoming({ startDate: null, endDate: null, lastMatchDate: null }, NOW),
    ).toBe(false);
  });

  it('keeps a tournament with only a startDate, regardless of when it is', () => {
    expect(
      isTournamentCurrentOrUpcoming(
        { startDate: '2026-11-01T00:00:00.000Z', endDate: null, lastMatchDate: null },
        NOW,
      ),
    ).toBe(true);
    // Already started, nothing marks it as over -- still kept, same
    // reasoning as the "no effectiveEnd" branch for endDate/lastMatchDate.
    expect(
      isTournamentCurrentOrUpcoming(
        { startDate: '2026-01-01T00:00:00.000Z', endDate: null, lastMatchDate: null },
        NOW,
      ),
    ).toBe(true);
  });

  it('prefers endDate over lastMatchDate when both are set', () => {
    expect(
      isTournamentCurrentOrUpcoming(
        {
          startDate: null,
          endDate: '2026-12-25T00:00:00.000Z',
          lastMatchDate: '2026-01-01T00:00:00.000Z',
        },
        NOW,
      ),
    ).toBe(true);
  });
});
