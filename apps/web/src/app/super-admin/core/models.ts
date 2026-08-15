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
  sportName: string;
  status: string;
}

export interface SuperAdminOrganizationDetail {
  id: string;
  name: string;
  suspendedAt: string | null;
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
  organizations: { id: string; name: string; role: string }[];
}

export interface SuperAdminTournamentRow {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  sportName: string;
  status: string;
  teamsCount: number;
  matchesPlayedCount: number;
  createdAt: string;
}

export interface SuperAdminTournamentDetail {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  sportName: string;
  status: string;
  createdAt: string;
  teams: { id: string; name: string }[];
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
  amountCents: number;
  currency: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  note: string | null;
}

export interface SuperAdminStats {
  totalUsers: number;
  totalOrganizations: number;
  tournamentsByStatus: Record<'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED', number>;
  matchesPlayed: number;
  activeSubscriptions: number;
  revenueCents: number;
}
