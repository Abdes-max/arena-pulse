import { isTestUser } from './test-data.util';

describe('isTestUser', () => {
  it('flags @example.com addresses, whatever the organizations', () => {
    expect(isTestUser('Demo@Example.com', [{ isTest: false }])).toBe(true);
    expect(isTestUser('demo@example.com', [])).toBe(true);
  });

  it('flags an account whose organizations are all test ones', () => {
    expect(isTestUser('a@b.fr', [{ isTest: true }, { isTest: true }])).toBe(
      true,
    );
  });

  it('keeps real accounts, with or without an organization', () => {
    expect(isTestUser('a@b.fr', [])).toBe(false);
    expect(isTestUser('a@b.fr', [{ isTest: true }, { isTest: false }])).toBe(
      false,
    );
  });
});
