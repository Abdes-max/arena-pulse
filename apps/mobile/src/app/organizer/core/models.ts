// TournamentStatus/PublicTheme come from shared-models (not duplicated
// below): the same enum values already cross the public/organizer boundary
// via the public tournament directory + PublicApiService, unlike
// OrganizationRole/OrganizerUser/MeResponse below, which are genuinely
// organizer-only shapes mirroring apps/web/src/app/admin/core/models.ts --
// deliberately duplicated rather than shared, same convention as that
// file's own top comment: this is an admin/organizer-app concern, not a
// public one, so it doesn't belong in shared-models alongside the
// public-site types both apps already share.
import type { CompetitionPhase, PublicTheme, TournamentStatus } from 'shared-models';

export type { PublicTheme, TournamentStatus };

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

export interface OrganizerTournament {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  sportId: string;
  sportName: string;
  isOnline: boolean;
  isListed: boolean;
  theme: PublicTheme;
  logoUrl: string | null;
  createdAt: string;
}

export interface CreateTournamentPayload {
  name: string;
  sportId: string;
  isOnline?: boolean;
  isListed?: boolean;
  theme?: PublicTheme;
}

// Publishing may require a Stripe payment first once past the free tier
// (see PremiumFeaturesStatus below) -- mirrors
// apps/web/src/app/admin/core/tournaments.service.ts's own
// PublishTournamentResult, same /publish + /publish/confirm endpoints.
export interface PublishPendingPayment {
  status: 'PENDING_PAYMENT';
  checkoutUrl: string;
  // Which iOS In-App Purchase product (if any) covers this exact gap --
  // null when no matching product exists for the amount (e.g. tier prices
  // are unset/0 in this environment). See IapService and
  // tournament-wizard.page.ts's submitPublish() for how this drives the
  // native purchase flow on iOS (guideline 3.1.1) instead of opening
  // checkoutUrl, which iOS never does.
  iapProductId: IapProductId | null;
}

// Mirrors apps/api's IAP_PRODUCT_IDS (payments/revenuecat.service.ts) --
// kept as a plain union of the same string literals rather than importing
// from the backend, same "deliberate port, not a shared lib" convention as
// the rest of this file.
export type IapProductId =
  | 'tournament_publication_standard'
  | 'tournament_publication_large'
  | 'tournament_publication_upgrade_standard_to_large'
  | 'annual_subscription';

export type PublishTournamentResult = OrganizerTournament | PublishPendingPayment;

export interface PremiumFeaturesStatus {
  unlocked: boolean;
  freeMaxTeams: number;
}

export interface OrganizerTeam {
  id: string;
  name: string;
  categoryId: string;
}

export interface OrganizerCategory {
  id: string;
  name: string;
}

// The 3 formats the creation wizard's "Structure" step offers -- a
// deliberately narrowed subset of what CreateStructurePresetDto actually
// supports server-side (multi-tier brackets, best-of-position qualifiers,
// custom match/break durations...): this wizard is a fast "get started"
// path, not the full structure editor. "league" (round-robin) is just
// POOLS_ONLY with a single pool under the hood -- see
// tournament-creation.service.ts's buildStructurePresetPayload().
export type WizardStructureFormat = 'pools-knockout' | 'knockout-only' | 'league';

export interface StructurePresetResult {
  groupPhaseId: string;
  tiers: { phaseId: string; name: string; bracketSize: number }[];
}

// Originally "just enough" of apps/web's own CompetitionPhase for the
// edit-mode wizard to tell "does a structure already exist" and summarize
// it read-only (see tournament-wizard.page.ts's loadForEdit). Widened to a
// straight alias of shared-models' own CompetitionPhase (PR 4, Scores +
// Classements) since those pages need the full shape -- position for
// tournament-order sorting, the complete KnockoutBracket/CompetitionGroup
// objects groupMatchesByPhaseSection/buildBracketView expect, not the
// trimmed {id,name}/{id,size} views this used to carry. The API already
// returns the full shape either way; only the TS type was narrower before.
export type OrganizerPhase = CompetitionPhase;

// Mirrors apps/web/src/app/admin/core/models.ts's own StandingRule --
// admin/organizer-app concern (barème config), not shared with the public
// site, same convention as the rest of this file's top comment.
export interface OrganizerStandingRule {
  groupId: string;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  tieBreakOrder: string[];
  supplementaryStandingEnabled: boolean;
  penaltyShootoutEnabled: boolean;
}
