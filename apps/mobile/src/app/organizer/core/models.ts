// Mirrors the shapes apps/web/src/app/admin/core/models.ts defines for the
// exact same /auth/me response -- deliberately duplicated rather than
// shared, same convention as that file's own top comment: this is an
// admin/organizer-app concern, not a public one, so it doesn't belong in
// shared-models alongside the public-site types both apps already share.

export type OrganizationRole = 'ORG_ADMIN' | 'ORG_MEMBER';

export interface OrganizerUser {
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

export interface MeResponse extends OrganizerUser {
  organizations: OrganizationSummary[];
}
