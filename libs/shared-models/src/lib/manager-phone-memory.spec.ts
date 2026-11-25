import { recallManagerPhone, rememberManagerPhone } from './manager-phone-memory';

describe('manager phone memory', () => {
  beforeEach(() => localStorage.clear());

  it('has nothing to recall at first', () => {
    expect(recallManagerPhone('U14')).toBe('');
  });

  it('recalls the phone saved for a category, else the last one used', () => {
    rememberManagerPhone('U14', '06 11 22 33 44');
    rememberManagerPhone('U11', '07 55 66 77 88');

    expect(recallManagerPhone('u14 ')).toBe('06 11 22 33 44');
    expect(recallManagerPhone('U11')).toBe('07 55 66 77 88');
    expect(recallManagerPhone('Senior')).toBe('07 55 66 77 88');
    expect(recallManagerPhone(null)).toBe('07 55 66 77 88');
  });

  it('ignores an empty phone', () => {
    rememberManagerPhone('U14', '06 11 22 33 44');
    rememberManagerPhone('U14', '   ');

    expect(recallManagerPhone('U14')).toBe('06 11 22 33 44');
  });
});
