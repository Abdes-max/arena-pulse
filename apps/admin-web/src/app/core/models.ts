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
