import { Prisma } from '../../generated/prisma/client';

// Demo / test data (Organization.isTest, set by a super admin). The dashboard
// leaves it out by default so its figures describe real customers.

/** Seed and CI accounts use @example.com addresses. */
const TEST_EMAIL_SUFFIX = '@example.com';

/** Accounts that are not demo / test: not an @example.com address, and not only a member of test organizations. */
export const REAL_USER_WHERE: Prisma.UserWhereInput = {
  NOT: [
    { email: { endsWith: TEST_EMAIL_SUFFIX, mode: 'insensitive' } },
    { memberships: { some: {}, every: { organization: { isTest: true } } } },
  ],
};

/** The opposite of REAL_USER_WHERE. */
export const TEST_USER_WHERE: Prisma.UserWhereInput = {
  OR: [
    { email: { endsWith: TEST_EMAIL_SUFFIX, mode: 'insensitive' } },
    { memberships: { some: {}, every: { organization: { isTest: true } } } },
  ],
};

export function isTestUser(
  email: string,
  organizations: readonly { isTest: boolean }[],
): boolean {
  return (
    email.toLowerCase().endsWith(TEST_EMAIL_SUFFIX) ||
    (organizations.length > 0 && organizations.every((org) => org.isTest))
  );
}
