import { defaultGameFormat, gameFormatsFor } from './game-formats';

describe('gameFormatsFor', () => {
  it('lists the formats of a sport, whatever its case and accents', () => {
    expect(gameFormatsFor('Football')).toContain('8 vs 8');
    expect(gameFormatsFor('Padel')).toEqual(['Double', 'Double mixte']);
  });

  it('falls back to a generic list for an unknown sport', () => {
    expect(gameFormatsFor('Curling').length).toBeGreaterThan(0);
    expect(gameFormatsFor(null).length).toBeGreaterThan(0);
  });
});

describe('defaultGameFormat', () => {
  it('follows the French youth football sizes', () => {
    expect(defaultGameFormat('Football', 'U7')).toBe('4 vs 4');
    expect(defaultGameFormat('Football', 'U9')).toBe('5 vs 5');
    expect(defaultGameFormat('Football', 'U11')).toBe('8 vs 8');
    expect(defaultGameFormat('Football', 'U15')).toBe('11 vs 11');
    expect(defaultGameFormat('Football', 'Senior')).toBe('11 vs 11');
  });

  it("takes the sport's first format otherwise", () => {
    expect(defaultGameFormat('Basketball')).toBe('3x3');
  });
});
