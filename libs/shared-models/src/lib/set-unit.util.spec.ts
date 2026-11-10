import { setUnitForSport } from './set-unit.util';

describe('setUnitForSport', () => {
  it('counts games in tennis and padel', () => {
    expect(setUnitForSport('Tennis')).toBe('games');
    expect(setUnitForSport(' Padel ')).toBe('games');
  });

  it('counts points in volleyball and badminton', () => {
    expect(setUnitForSport('Volleyball')).toBe('points');
    expect(setUnitForSport('Badminton')).toBe('points');
  });
});
