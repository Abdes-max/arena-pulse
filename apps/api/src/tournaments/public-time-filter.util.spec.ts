import { publicTimeWhere } from './public-time-filter.util';

describe('publicTimeWhere', () => {
  const now = new Date('2026-11-10T15:30:00');
  const todayStart = new Date('2026-11-10T00:00:00');

  it('past: the last day (end, else start) is before today', () => {
    expect(publicTimeWhere('past', now)).toEqual({
      OR: [
        { endDate: { lt: todayStart } },
        { endDate: null, startDate: { lt: todayStart } },
      ],
    });
  });

  it('upcoming: ends today or later, or has no date at all', () => {
    expect(publicTimeWhere('upcoming', now)).toEqual({
      OR: [
        { endDate: { gte: todayStart } },
        { endDate: null, startDate: { gte: todayStart } },
        { endDate: null, startDate: null },
      ],
    });
  });
});
