export type OrganizationRole = 'ORG_ADMIN' | 'ORG_MEMBER';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  role: OrganizationRole;
}

export interface MeResponse extends User {
  organizations: OrganizationSummary[];
}

export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: OrganizationRole;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: OrganizationRole;
  status: string;
  expiresAt: string;
}

export interface InvitationLookup {
  organizationName: string;
  email: string;
  role: OrganizationRole;
  requiresNewAccount: boolean;
}

export interface Sport {
  id: string;
  name: string;
}

export interface Permission {
  id: string;
  key: string;
  label: string;
}

export type TournamentStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  sportId: string;
  sportName: string;
  startDate: string | null;
  endDate: string | null;
  isOnline: boolean;
  createdAt: string;
}

export interface TournamentDetail extends Tournament {
  organizationId: string;
  archivedAt: string | null;
  updatedAt: string;
  teamsCanReferee: boolean;
}

export interface Division {
  id: string;
  name: string;
  colorHex: string | null;
  position: number;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  divisions: Division[];
}

export interface TournamentAdministrator {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  permissionKeys: string[];
}

export interface Team {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  divisionId: string | null;
  divisionName: string | null;
  managerName: string | null;
  managerEmail: string | null;
  managerPhone: string | null;
  position: number;
}

export interface TeamImportError {
  line: number;
  message: string;
}

export interface TeamImportResult {
  created: Team[];
  errors: TeamImportError[];
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  isCaptain: boolean;
}

export interface Field {
  id: string;
  name: string;
  surface: string | null;
  position: number;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  position: number;
  fields: Field[];
}

export interface Referee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}
