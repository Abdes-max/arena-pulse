export interface SuperAdminAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SuperAdminOrganizationRow {
  id: string;
  name: string;
  membersCount: number;
  tournamentsCount: number;
  subscriptionStatus: 'ACTIVE' | 'NONE';
  suspendedAt: string | null;
  isTest: boolean;
  createdAt: string;
}

export interface SuperAdminOrganizationMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ORG_ADMIN' | 'ORG_MEMBER';
}

export interface SuperAdminOrganizationTournamentSummary {
  id: string;
  name: string;
  slug: string;
  sportName: string;
  status: string;
}

export interface SuperAdminOrganizationDetail {
  id: string;
  name: string;
  suspendedAt: string | null;
  isTest: boolean;
  createdAt: string;
  members: SuperAdminOrganizationMember[];
  tournaments: SuperAdminOrganizationTournamentSummary[];
}

export interface SuperAdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  isTest: boolean;
  organizations: { id: string; name: string; role: string }[];
}

export interface SuperAdminTournamentRow {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  organizationIsTest: boolean;
  sportName: string;
  slug: string;
  status: string;
  teamsCount: number;
  matchesPlayedCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

export interface SuperAdminTournamentDetail {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  organizationIsTest: boolean;
  sportName: string;
  slug: string;
  status: string;
  createdAt: string;
  teams: {
    id: string;
    name: string;
    players: { id: string; firstName: string; lastName: string }[];
  }[];
  referees: { id: string; firstName: string; lastName: string; email: string | null }[];
  categories: { id: string; name: string }[];
  matches: {
    id: string;
    status: string;
    homeTeamName: string | null;
    awayTeamName: string | null;
    homeScore: number | null;
    awayScore: number | null;
  }[];
}

export type SuperAdminPaymentType = 'REGISTRATION' | 'PUBLICATION' | 'SUBSCRIPTION';

export interface SuperAdminPaymentRow {
  id: string;
  type: SuperAdminPaymentType;
  organizationId: string;
  organizationName: string;
  organizationIsTest: boolean;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  note: string | null;
}

export type SuperAdminTournamentStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export interface SuperAdminStats {
  /** Null when the figures cover everything. */
  period: { from: string | null; to: string | null } | null;
  /** False: demo / test organizations are left out of every figure. */
  includeTest: boolean;
  users: { total: number; verified: number; unverified: number };
  organizations: { total: number; suspended: number };
  subscriptions: { active: number };
  tournaments: { total: number; byStatus: Record<SuperAdminTournamentStatus, number> };
  teams: number;
  matches: { played: number; toPlay: number };
  registrations: { paid: number };
  revenue: {
    totalCents: number;
    publicationCents: number;
    subscriptionCents: number;
    registrationCents: number;
  };
  /** What the default view leaves out (all time). */
  testData: { users: number; organizations: number; tournaments: number };
  recent: {
    organizations: { id: string; name: string; createdAt: string; isTest: boolean }[];
    tournaments: {
      id: string;
      name: string;
      slug: string;
      status: SuperAdminTournamentStatus;
      organizationName: string;
      createdAt: string;
    }[];
  };
}
