import { isCompleteFullName, splitFullName } from './full-name';

describe('splitFullName', () => {
  it('takes the first word as the first name and the rest as the last name', () => {
    expect(splitFullName('  Camille   Martin ')).toEqual({
      firstName: 'Camille',
      lastName: 'Martin',
    });
    expect(splitFullName('Jean-Marc De La Tour')).toEqual({
      firstName: 'Jean-Marc',
      lastName: 'De La Tour',
    });
  });

  it('leaves the last name empty for a single word', () => {
    expect(splitFullName('Camille')).toEqual({ firstName: 'Camille', lastName: '' });
    expect(isCompleteFullName('Camille')).toBe(false);
    expect(isCompleteFullName('   ')).toBe(false);
    expect(isCompleteFullName('Camille Martin')).toBe(true);
  });
});
