import type { APIRequestContext } from '@playwright/test';

// Thin REST client for e2e-full/'s own test data setup -- every spec pushes
// its fixture state (teams in bulk, structure, schedule) directly through
// these already-existing API endpoints via Playwright's APIRequestContext
// rather than clicking through the UI 8/48 times, same convention as
// apps/api/test/*.e2e-spec.ts's own supertest helpers. Only the behaviors
// actually under test (adding a team post-publication, entering/validating
// a score, tapping Publish/Unpublish) go through real page interactions in
// the spec files themselves.
const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';
const MAILHOG_BASE = process.env.E2E_MAILHOG_URL ?? 'http://localhost:8025';

export interface OrganizerSession {
  accessToken: string;
  organizationId: string;
  email: string;
  password: string;
}

// Cache-Control: no-cache alongside the bearer token on every call -- GET
// endpoints here (tournament status, matches, standings) are polled
// repeatedly against the exact same URL within a single test (publish then
// immediately re-check status, playAllScoresToCompletion re-reading match
// state), and Playwright's request context (a real browser network stack,
// unlike a bare Node fetch) does honor a served ETag/Cache-Control and can
// silently return a stale cached response on those repeats otherwise --
// found the hard way debugging a false "still PUBLISHED after unpublish"
// read in this suite's own first run.
function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'Cache-Control': 'no-cache' };
}

/** Decodes a Mailhog message's quoted-printable body and pulls out the first verify-email link. */
function extractVerifyLink(quotedPrintableBody: string): string | null {
  const decoded = quotedPrintableBody
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const match = /http[^"'<\s]*verify-email[^"'<\s]*/.exec(decoded);
  return match ? match[0] : null;
}

/**
 * Polls Mailhog for the verification email just sent to `email`, up to
 * ~30s. Register sends TWO emails to the same recipient (a "Bienvenue"
 * welcome mail and the actual verify-email one, see mail.service.ts) --
 * matching on recipient alone can pick the wrong one, so every message
 * for this recipient is tried until one actually yields a verify-email
 * link, not just the first (order isn't guaranteed to be the verify mail).
 */
async function findVerifyToken(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = await request.get(`${MAILHOG_BASE}/api/v2/messages`);
    const body = (await res.json()) as {
      items: { ID: string; To: { Mailbox: string; Domain: string }[] }[];
    };
    const candidates = body.items.filter((item) =>
      item.To.some((to) => `${to.Mailbox}@${to.Domain}`.toLowerCase() === email.toLowerCase()),
    );
    for (const message of candidates) {
      const detail = await request.get(`${MAILHOG_BASE}/api/v1/messages/${message.ID}`);
      const detailBody = (await detail.json()) as { Content: { Body: string } };
      const link = extractVerifyLink(detailBody.Content.Body);
      const token = link?.split('/verify-email/')[1];
      if (token) {
        return token;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No verification email found for ${email} after polling Mailhog`);
}

/** Registers a fresh unique organizer account, verifies it via Mailhog, logs in, and resolves its organization id -- everything each spec file needs to start pushing fixture state. */
export async function setupOrganizer(
  request: APIRequestContext,
  namePrefix: string,
): Promise<OrganizerSession> {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `${namePrefix}-${unique}@example.com`;
  const password = 'TestPassword123!';

  await request.post(`${API_BASE}/auth/register`, {
    data: {
      organizationName: `E2E ${namePrefix} ${unique}`,
      firstName: 'E2E',
      lastName: namePrefix,
      email,
      password,
    },
  });

  const token = await findVerifyToken(request, email);
  await request.post(`${API_BASE}/auth/verify-email/${token}`);

  const loginRes = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  const loginBody = (await loginRes.json()) as { accessToken: string };

  const meRes = await request.get(`${API_BASE}/auth/me`, {
    headers: authHeaders(loginBody.accessToken),
  });
  const meBody = (await meRes.json()) as { organizations: { id: string }[] };

  return {
    accessToken: loginBody.accessToken,
    organizationId: meBody.organizations[0].id,
    email,
    password,
  };
}

export async function firstSportId(request: APIRequestContext, session: OrganizerSession): Promise<string> {
  const res = await request.get(`${API_BASE}/sports`, { headers: authHeaders(session.accessToken) });
  const sports = (await res.json()) as { id: string; name: string }[];
  const football = sports.find((sport) => sport.name === 'Football');
  return (football ?? sports[0]).id;
}

export async function createTournament(
  request: APIRequestContext,
  session: OrganizerSession,
  name: string,
  sportId: string,
): Promise<string> {
  const res = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments`,
    { headers: authHeaders(session.accessToken), data: { name, sportId } },
  );
  const body = (await res.json()) as { id: string };
  return body.id;
}

export async function createCategory(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  name = 'Général',
): Promise<string> {
  const res = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/categories`,
    { headers: authHeaders(session.accessToken), data: { name } },
  );
  const body = (await res.json()) as { id: string };
  return body.id;
}

/** Bulk-creates `count` teams named `${prefix} 1`..`${prefix} N` -- this is the "8/48 teams" scale lever every capacity-test scenario uses. */
/**
 * Creates a minimal KNOCKOUT phase directly (not via structure-presets, no
 * teams/pools required) -- just enough to satisfy
 * TournamentsService.assertReadyToPublish's "at least one category + one
 * phase" guard (apps/api/src/tournaments/tournaments.service.ts) for specs
 * that only care about the publish/unpublish lifecycle itself, not a real
 * playable structure. Mirrors apps/api/test/utils/make-tournament-publishable.ts's
 * own approach.
 */
export async function createBarePhase(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  categoryId: string,
): Promise<void> {
  await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/categories/${categoryId}/phases`,
    { headers: authHeaders(session.accessToken), data: { name: 'Tableau final', type: 'KNOCKOUT' } },
  );
}

export async function createTeams(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  categoryId: string,
  count: number,
  prefix = 'Équipe',
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    const res = await request.post(
      `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/teams`,
      { headers: authHeaders(session.accessToken), data: { name: `${prefix} ${i}`, categoryId } },
    );
    const body = (await res.json()) as { id: string };
    ids.push(body.id);
  }
  return ids;
}

export async function createVenueAndField(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
): Promise<string> {
  const venueRes = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/venues`,
    { headers: authHeaders(session.accessToken), data: { name: 'Gymnase 1' } },
  );
  const venue = (await venueRes.json()) as { id: string };
  const fieldRes = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/venues/${venue.id}/fields`,
    { headers: authHeaders(session.accessToken), data: { name: 'Terrain 1' } },
  );
  const field = (await fieldRes.json()) as { id: string };
  return field.id;
}

export type StructureFormat = 'POOLS_ONLY' | 'POOLS_AND_KNOCKOUT' | 'KNOCKOUT_ONLY';

export interface StructurePresetResult {
  groupPhaseId: string;
  tiers: { phaseId: string; name: string; bracketSize: number }[];
}

export async function createStructurePreset(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  categoryId: string,
  options: { format: StructureFormat; teamCount: number; poolCount?: number },
): Promise<StructurePresetResult> {
  const payload: Record<string, unknown> = { format: options.format, teamCount: options.teamCount };
  if (options.format !== 'KNOCKOUT_ONLY') {
    payload.poolCount = options.poolCount ?? 1;
  }
  if (options.format === 'POOLS_AND_KNOCKOUT') {
    payload.tiers = [{ name: 'Tableau final', qualifiersPerPool: 2 }];
  }
  const res = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/categories/${categoryId}/structure-presets`,
    { headers: authHeaders(session.accessToken), data: payload },
  );
  return (await res.json()) as StructurePresetResult;
}

export interface ApiMatch {
  id: string;
  round: number;
  status: string;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  score: { homeScore: number; awayScore: number; isValidated: boolean } | null;
}

export async function generateSchedule(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  phaseId: string,
  fieldId: string,
  startDateTime: string,
): Promise<ApiMatch[]> {
  const res = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/phases/${phaseId}/generate-schedule`,
    {
      headers: authHeaders(session.accessToken),
      data: { fieldIds: [fieldId], startDateTime, matchDurationMinutes: 15, breakDurationMinutes: 5 },
    },
  );
  return (await res.json()) as ApiMatch[];
}

/**
 * Creates every knockout tier's placeholder Round-1 matches (and wires
 * later rounds) for a category -- NOT automatic. BracketsService.
 * tryResolveFirstRound (called after each pool match validates) only ever
 * *fills in* real opponents on existing placeholder Match rows; it never
 * creates them. Without this call first, a knockout bracket has zero Match
 * rows at all no matter how many pool matches get validated -- found the
 * hard way playing a POOLS_AND_KNOCKOUT tournament to completion and seeing
 * the bracket phase stay permanently empty.
 */
export async function generateAllBracketMatches(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  categoryId: string,
  fieldId: string,
  startDateTime?: string,
): Promise<void> {
  await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/categories/${categoryId}/knockout-phases/generate-matches`,
    {
      headers: authHeaders(session.accessToken),
      data: { fieldIds: [fieldId], startDateTime },
    },
  );
}

export async function listMatches(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  phaseId: string,
): Promise<ApiMatch[]> {
  const res = await request.get(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/phases/${phaseId}/matches`,
    { headers: authHeaders(session.accessToken) },
  );
  return (await res.json()) as ApiMatch[];
}

export async function listPhases(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  categoryId: string,
): Promise<{ id: string; name: string; type: 'GROUP_STAGE' | 'KNOCKOUT'; isSeedPhase: boolean; groups: { id: string; name: string }[]; knockoutBracket: { id: string; size: number } | null }[]> {
  const res = await request.get(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/categories/${categoryId}/phases`,
    { headers: authHeaders(session.accessToken) },
  );
  return await res.json();
}

/** Enters and validates a score for `matchId` in one call -- what every "score jusqu'au bout" playthrough loop calls per match once opponents are known. */
export async function scoreAndValidateMatch(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  matchId: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  await request.put(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/matches/${matchId}/score`,
    { headers: authHeaders(session.accessToken), data: { homeScore, awayScore } },
  );
  await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/matches/${matchId}/score/validate`,
    { headers: authHeaders(session.accessToken) },
  );
}

export async function publish(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
): Promise<{ status: string }> {
  const res = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/publish`,
    { headers: authHeaders(session.accessToken), data: { isListed: true } },
  );
  return (await res.json()) as { status: string };
}

export async function unpublish(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
): Promise<{ status: string }> {
  const res = await request.post(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/unpublish`,
    { headers: authHeaders(session.accessToken) },
  );
  return (await res.json()) as { status: string };
}

export async function getTournamentStatus(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
): Promise<string> {
  const res = await request.get(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}`,
    { headers: authHeaders(session.accessToken) },
  );
  const body = (await res.json()) as { status: string };
  return body.status;
}

export async function listTeams(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  categoryId: string,
): Promise<{ id: string; name: string }[]> {
  const res = await request.get(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/teams?categoryId=${categoryId}`,
    { headers: authHeaders(session.accessToken) },
  );
  return await res.json();
}

export async function getStandings(
  request: APIRequestContext,
  session: OrganizerSession,
  tournamentId: string,
  groupId: string,
): Promise<{ rows: { teamId: string; teamName: string; position: number; points: number }[]; isComplete: boolean }> {
  const res = await request.get(
    `${API_BASE}/organizations/${session.organizationId}/tournaments/${tournamentId}/groups/${groupId}/standings`,
    { headers: authHeaders(session.accessToken) },
  );
  return await res.json();
}

export { API_BASE, authHeaders };
