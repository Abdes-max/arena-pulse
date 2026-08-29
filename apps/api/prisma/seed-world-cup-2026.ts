// Seeds one real, historically-accurate tournament: the 2026 FIFA World Cup
// (12 groups of 4, top 2 + 8 best third-placed teams -> round of 32 through
// the final), with the actual real-world scores throughout.
//
// The group stage (72 matches) is built entirely through the public API,
// exactly like infra/scripts/seed-demo-data.mjs: create groups/teams,
// generate the round-robin schedule, submit + validate the real score for
// each generated match (matched by team-name pair, order-agnostic).
//
// The knockout stage (32 matches: R32, R16, QF, SF, final, 3rd place) can't
// be built the same way. The product's only match-creation endpoint for a
// bracket (`POST .../knockout-brackets/:id/generate-matches`) seeds R32 from
// qualification rules using a generic reseeding algorithm (bracket-seeding
// util's `seedOrder`), not FIFA's actual draw -- there is no API to assign a
// specific pairing to a specific bracket slot. So this script still calls
// that endpoint (it's the only thing that creates the *placeholder* rows for
// every later round -- BracketsService.tryAdvanceRound only fills existing
// placeholders in now, it no longer creates them on the fly), then
// overwrites just the 16 R32 matches it created with the real pairings via
// Prisma, in a bracketSlot order chosen so that tryAdvanceRound's fixed
// adjacent-slot pairing (slot 2k + slot 2k+1 -> next round's slot k)
// reproduces the real R16/QF/SF/final/3rd place bracket exactly. From R32
// onward, everything again goes through the public API (score submission
// triggers tryAdvanceRound automatically) -- only the first round's team
// pairing needed the raw DB write.
//
// Usage (from apps/api): npm run build && node dist/prisma/seed-world-cup-2026.js
// Env: API_URL (default http://localhost:3000/api/v1)

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// This script's ~350 sequential requests (48 teams, 72 group matches scored
// + validated, a full 32-team bracket played round by round…) comfortably
// clear the global rate limit (100 req/60s, app.module.ts -- production-
// appropriate, not relaxed for this) if fired back-to-back. A fixed pause
// between every call keeps the sustained rate under that limit instead of
// bursting through it, rather than reaching for NODE_ENV=test (which also
// changes unrelated app behaviour, e.g. email-verification/mail-sending
// paths -- too broad a hammer for what's really just "don't get
// throttled").
const API_CALL_DELAY_MS = 650;

async function api(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
) {
  await sleep(API_CALL_DELAY_MS);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

// flagcdn.com: free, no API key, ISO 3166-1 alpha-2 codes (plus the UK's
// constituent-nation codes flagcdn also serves -- gb-eng/gb-sct -- for the
// two home nations that play as their own team, not "United Kingdom").
// PNG only (the product's own upload endpoint only accepts PNG/JPEG/WebP,
// see TEAM_LOGO_ALLOWED_MIME_TYPES in teams.service.ts) -- w320 is small
// (a few hundred bytes to a few KB per flag, solid-color-heavy images
// compress well) and comfortably under the 2 MB upload limit.
const FLAG_CDN_BASE = 'https://flagcdn.com/w320';

const COUNTRY_FLAG_CODES: Record<string, string> = {
  Mexique: 'mx',
  'Afrique du Sud': 'za',
  'Corée du Sud': 'kr',
  'République tchèque': 'cz',
  Canada: 'ca',
  'Bosnie-Herzégovine': 'ba',
  Qatar: 'qa',
  Suisse: 'ch',
  Brésil: 'br',
  Maroc: 'ma',
  Haïti: 'ht',
  Écosse: 'gb-sct',
  'États-Unis': 'us',
  Paraguay: 'py',
  Australie: 'au',
  Turquie: 'tr',
  Allemagne: 'de',
  Curaçao: 'cw',
  "Côte d'Ivoire": 'ci',
  Équateur: 'ec',
  'Pays-Bas': 'nl',
  Japon: 'jp',
  Suède: 'se',
  Tunisie: 'tn',
  Belgique: 'be',
  Égypte: 'eg',
  Iran: 'ir',
  'Nouvelle-Zélande': 'nz',
  Espagne: 'es',
  'Cap-Vert': 'cv',
  'Arabie Saoudite': 'sa',
  Uruguay: 'uy',
  France: 'fr',
  Norvège: 'no',
  Sénégal: 'sn',
  Irak: 'iq',
  Argentine: 'ar',
  Algérie: 'dz',
  Autriche: 'at',
  Jordanie: 'jo',
  Portugal: 'pt',
  'RD Congo': 'cd',
  Ouzbékistan: 'uz',
  Colombie: 'co',
  Angleterre: 'gb-eng',
  Croatie: 'hr',
  Ghana: 'gh',
  Panama: 'pa',
};

// Separate from `api()` above -- this is a multipart upload (the product's
// logo endpoint expects a `logo` file field, not JSON), and errors here are
// deliberately non-fatal: a flag CDN hiccup shouldn't fail the whole seed
// run over cosmetics the tournament works perfectly well without.
async function uploadTeamLogo(
  token: string,
  orgId: string,
  tournamentId: string,
  teamId: string,
  teamName: string,
): Promise<void> {
  const flagCode = COUNTRY_FLAG_CODES[teamName];
  if (!flagCode) {
    console.warn(`  (no flag mapped for "${teamName}", skipping logo)`);
    return;
  }
  try {
    const flagRes = await fetch(`${FLAG_CDN_BASE}/${flagCode}.png`);
    if (!flagRes.ok) {
      throw new Error(`GET flag ${flagCode}.png -> ${flagRes.status}`);
    }
    const flagBytes = await flagRes.arrayBuffer();
    const form = new FormData();
    form.append(
      'logo',
      new Blob([flagBytes], { type: 'image/png' }),
      `${flagCode}.png`,
    );

    await sleep(API_CALL_DELAY_MS);
    const uploadRes = await fetch(
      `${API}/organizations/${orgId}/tournaments/${tournamentId}/teams/${teamId}/logo`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '');
      throw new Error(`POST .../logo -> ${uploadRes.status}: ${text}`);
    }
  } catch (error) {
    console.warn(
      `  (logo upload failed for "${teamName}": ${error instanceof Error ? error.message : error} -- continuing without it)`,
    );
  }
}

interface GroupMatch {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
}

interface GroupDef {
  name: string;
  teams: string[];
  matches: GroupMatch[];
  thirdQualifies: boolean;
}

interface BracketMatch {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
}

// --- Group stage: real 2026 FIFA World Cup results (Wikipedia, cross-checked
// against ESPN/FIFA match centre/news wire reports for every knockout match).
const GROUPS: GroupDef[] = [
  {
    name: 'Groupe A',
    teams: ['Mexique', 'Afrique du Sud', 'Corée du Sud', 'République tchèque'],
    thirdQualifies: false,
    matches: [
      { home: 'Mexique', away: 'Afrique du Sud', homeScore: 2, awayScore: 0 },
      {
        home: 'Corée du Sud',
        away: 'République tchèque',
        homeScore: 2,
        awayScore: 1,
      },
      {
        home: 'République tchèque',
        away: 'Afrique du Sud',
        homeScore: 1,
        awayScore: 1,
      },
      { home: 'Mexique', away: 'Corée du Sud', homeScore: 1, awayScore: 0 },
      {
        home: 'République tchèque',
        away: 'Mexique',
        homeScore: 0,
        awayScore: 3,
      },
      {
        home: 'Afrique du Sud',
        away: 'Corée du Sud',
        homeScore: 1,
        awayScore: 0,
      },
    ],
  },
  {
    name: 'Groupe B',
    teams: ['Canada', 'Bosnie-Herzégovine', 'Qatar', 'Suisse'],
    thirdQualifies: true,
    matches: [
      {
        home: 'Canada',
        away: 'Bosnie-Herzégovine',
        homeScore: 1,
        awayScore: 1,
      },
      { home: 'Qatar', away: 'Suisse', homeScore: 1, awayScore: 1 },
      {
        home: 'Suisse',
        away: 'Bosnie-Herzégovine',
        homeScore: 4,
        awayScore: 1,
      },
      { home: 'Canada', away: 'Qatar', homeScore: 6, awayScore: 0 },
      { home: 'Suisse', away: 'Canada', homeScore: 2, awayScore: 1 },
      { home: 'Bosnie-Herzégovine', away: 'Qatar', homeScore: 3, awayScore: 1 },
    ],
  },
  {
    name: 'Groupe C',
    teams: ['Brésil', 'Maroc', 'Haïti', 'Écosse'],
    thirdQualifies: false,
    matches: [
      { home: 'Brésil', away: 'Maroc', homeScore: 1, awayScore: 1 },
      { home: 'Haïti', away: 'Écosse', homeScore: 0, awayScore: 1 },
      { home: 'Écosse', away: 'Maroc', homeScore: 0, awayScore: 1 },
      { home: 'Brésil', away: 'Haïti', homeScore: 3, awayScore: 0 },
      { home: 'Écosse', away: 'Brésil', homeScore: 0, awayScore: 3 },
      { home: 'Maroc', away: 'Haïti', homeScore: 4, awayScore: 2 },
    ],
  },
  {
    name: 'Groupe D',
    teams: ['États-Unis', 'Paraguay', 'Australie', 'Turquie'],
    thirdQualifies: true,
    matches: [
      { home: 'États-Unis', away: 'Paraguay', homeScore: 4, awayScore: 1 },
      { home: 'Australie', away: 'Turquie', homeScore: 2, awayScore: 0 },
      { home: 'États-Unis', away: 'Australie', homeScore: 2, awayScore: 0 },
      { home: 'Turquie', away: 'Paraguay', homeScore: 0, awayScore: 1 },
      { home: 'Turquie', away: 'États-Unis', homeScore: 3, awayScore: 2 },
      { home: 'Paraguay', away: 'Australie', homeScore: 0, awayScore: 0 },
    ],
  },
  {
    name: 'Groupe E',
    teams: ['Allemagne', 'Curaçao', "Côte d'Ivoire", 'Équateur'],
    thirdQualifies: true,
    matches: [
      { home: 'Allemagne', away: 'Curaçao', homeScore: 7, awayScore: 1 },
      { home: "Côte d'Ivoire", away: 'Équateur', homeScore: 1, awayScore: 0 },
      { home: 'Allemagne', away: "Côte d'Ivoire", homeScore: 2, awayScore: 1 },
      { home: 'Équateur', away: 'Curaçao', homeScore: 0, awayScore: 0 },
      { home: 'Curaçao', away: "Côte d'Ivoire", homeScore: 0, awayScore: 2 },
      { home: 'Équateur', away: 'Allemagne', homeScore: 2, awayScore: 1 },
    ],
  },
  {
    name: 'Groupe F',
    teams: ['Pays-Bas', 'Japon', 'Suède', 'Tunisie'],
    thirdQualifies: true,
    matches: [
      { home: 'Pays-Bas', away: 'Japon', homeScore: 2, awayScore: 2 },
      { home: 'Suède', away: 'Tunisie', homeScore: 5, awayScore: 1 },
      { home: 'Pays-Bas', away: 'Suède', homeScore: 5, awayScore: 1 },
      { home: 'Tunisie', away: 'Japon', homeScore: 0, awayScore: 4 },
      { home: 'Japon', away: 'Suède', homeScore: 1, awayScore: 1 },
      { home: 'Tunisie', away: 'Pays-Bas', homeScore: 1, awayScore: 3 },
    ],
  },
  {
    name: 'Groupe G',
    teams: ['Belgique', 'Égypte', 'Iran', 'Nouvelle-Zélande'],
    thirdQualifies: false,
    matches: [
      { home: 'Belgique', away: 'Égypte', homeScore: 1, awayScore: 1 },
      { home: 'Iran', away: 'Nouvelle-Zélande', homeScore: 2, awayScore: 2 },
      { home: 'Belgique', away: 'Iran', homeScore: 0, awayScore: 0 },
      { home: 'Nouvelle-Zélande', away: 'Égypte', homeScore: 1, awayScore: 3 },
      { home: 'Égypte', away: 'Iran', homeScore: 1, awayScore: 1 },
      {
        home: 'Nouvelle-Zélande',
        away: 'Belgique',
        homeScore: 1,
        awayScore: 5,
      },
    ],
  },
  {
    name: 'Groupe H',
    teams: ['Espagne', 'Cap-Vert', 'Arabie Saoudite', 'Uruguay'],
    thirdQualifies: false,
    matches: [
      { home: 'Espagne', away: 'Cap-Vert', homeScore: 0, awayScore: 0 },
      { home: 'Arabie Saoudite', away: 'Uruguay', homeScore: 1, awayScore: 1 },
      { home: 'Espagne', away: 'Arabie Saoudite', homeScore: 4, awayScore: 0 },
      { home: 'Uruguay', away: 'Cap-Vert', homeScore: 2, awayScore: 2 },
      { home: 'Cap-Vert', away: 'Arabie Saoudite', homeScore: 0, awayScore: 0 },
      { home: 'Uruguay', away: 'Espagne', homeScore: 0, awayScore: 1 },
    ],
  },
  {
    name: 'Groupe I',
    teams: ['France', 'Norvège', 'Sénégal', 'Irak'],
    thirdQualifies: true,
    matches: [
      { home: 'France', away: 'Sénégal', homeScore: 3, awayScore: 1 },
      { home: 'Irak', away: 'Norvège', homeScore: 1, awayScore: 4 },
      { home: 'France', away: 'Irak', homeScore: 3, awayScore: 0 },
      { home: 'Norvège', away: 'Sénégal', homeScore: 3, awayScore: 2 },
      { home: 'Norvège', away: 'France', homeScore: 1, awayScore: 4 },
      { home: 'Sénégal', away: 'Irak', homeScore: 5, awayScore: 0 },
    ],
  },
  {
    name: 'Groupe J',
    teams: ['Argentine', 'Algérie', 'Autriche', 'Jordanie'],
    thirdQualifies: true,
    matches: [
      { home: 'Argentine', away: 'Algérie', homeScore: 3, awayScore: 0 },
      { home: 'Autriche', away: 'Jordanie', homeScore: 3, awayScore: 1 },
      { home: 'Argentine', away: 'Autriche', homeScore: 2, awayScore: 0 },
      { home: 'Jordanie', away: 'Algérie', homeScore: 1, awayScore: 2 },
      { home: 'Algérie', away: 'Autriche', homeScore: 3, awayScore: 3 },
      { home: 'Jordanie', away: 'Argentine', homeScore: 1, awayScore: 3 },
    ],
  },
  {
    name: 'Groupe K',
    teams: ['Portugal', 'RD Congo', 'Ouzbékistan', 'Colombie'],
    thirdQualifies: true,
    matches: [
      { home: 'Portugal', away: 'RD Congo', homeScore: 1, awayScore: 1 },
      { home: 'Ouzbékistan', away: 'Colombie', homeScore: 1, awayScore: 3 },
      { home: 'Portugal', away: 'Ouzbékistan', homeScore: 5, awayScore: 0 },
      { home: 'Colombie', away: 'RD Congo', homeScore: 1, awayScore: 0 },
      { home: 'Colombie', away: 'Portugal', homeScore: 0, awayScore: 0 },
      { home: 'RD Congo', away: 'Ouzbékistan', homeScore: 3, awayScore: 1 },
    ],
  },
  {
    name: 'Groupe L',
    teams: ['Angleterre', 'Croatie', 'Ghana', 'Panama'],
    thirdQualifies: true,
    matches: [
      { home: 'Angleterre', away: 'Croatie', homeScore: 4, awayScore: 2 },
      { home: 'Ghana', away: 'Panama', homeScore: 1, awayScore: 0 },
      { home: 'Angleterre', away: 'Ghana', homeScore: 0, awayScore: 0 },
      { home: 'Panama', away: 'Croatie', homeScore: 0, awayScore: 1 },
      { home: 'Panama', away: 'Angleterre', homeScore: 0, awayScore: 2 },
      { home: 'Croatie', away: 'Ghana', homeScore: 2, awayScore: 1 },
    ],
  },
];

// --- Knockout stage, round 1 (round of 32): the raw Prisma insert below
// writes these 16 matches into bracketSlot 0..15 in exactly this order --
// chosen so tryAdvanceRound's fixed (slot 2k, slot 2k+1) -> next round's
// slot k pairing reproduces the real bracket at every subsequent round.
const ROUND_OF_32: BracketMatch[] = [
  { home: 'Afrique du Sud', away: 'Canada', homeScore: 0, awayScore: 1 },
  {
    home: 'Pays-Bas',
    away: 'Maroc',
    homeScore: 1,
    awayScore: 1,
    homePenaltyScore: 2,
    awayPenaltyScore: 3,
  },
  {
    home: 'Allemagne',
    away: 'Paraguay',
    homeScore: 1,
    awayScore: 1,
    homePenaltyScore: 3,
    awayPenaltyScore: 4,
  },
  { home: 'France', away: 'Suède', homeScore: 3, awayScore: 0 },
  { home: 'Portugal', away: 'Croatie', homeScore: 2, awayScore: 1 },
  { home: 'Espagne', away: 'Autriche', homeScore: 3, awayScore: 0 },
  {
    home: 'États-Unis',
    away: 'Bosnie-Herzégovine',
    homeScore: 2,
    awayScore: 0,
  },
  { home: 'Belgique', away: 'Sénégal', homeScore: 3, awayScore: 2 },
  { home: 'Brésil', away: 'Japon', homeScore: 2, awayScore: 1 },
  { home: "Côte d'Ivoire", away: 'Norvège', homeScore: 1, awayScore: 2 },
  { home: 'Mexique', away: 'Équateur', homeScore: 2, awayScore: 0 },
  { home: 'Angleterre', away: 'RD Congo', homeScore: 2, awayScore: 1 },
  { home: 'Argentine', away: 'Cap-Vert', homeScore: 3, awayScore: 2 },
  {
    home: 'Australie',
    away: 'Égypte',
    homeScore: 1,
    awayScore: 1,
    homePenaltyScore: 2,
    awayPenaltyScore: 4,
  },
  { home: 'Suisse', away: 'Algérie', homeScore: 2, awayScore: 0 },
  { home: 'Colombie', away: 'Ghana', homeScore: 1, awayScore: 0 },
];

// --- Every later round's real result, keyed loosely (matched by team-name
// pair regardless of order once the matches are auto-generated by the
// product) so a slot-order mistake fails loudly instead of silently
// recording the wrong score.
const ROUND_OF_16: BracketMatch[] = [
  { home: 'Canada', away: 'Maroc', homeScore: 0, awayScore: 3 },
  { home: 'Paraguay', away: 'France', homeScore: 0, awayScore: 1 },
  { home: 'Portugal', away: 'Espagne', homeScore: 0, awayScore: 1 },
  { home: 'États-Unis', away: 'Belgique', homeScore: 1, awayScore: 4 },
  { home: 'Brésil', away: 'Norvège', homeScore: 1, awayScore: 2 },
  { home: 'Mexique', away: 'Angleterre', homeScore: 2, awayScore: 3 },
  { home: 'Argentine', away: 'Égypte', homeScore: 3, awayScore: 2 },
  {
    home: 'Suisse',
    away: 'Colombie',
    homeScore: 0,
    awayScore: 0,
    homePenaltyScore: 4,
    awayPenaltyScore: 3,
  },
];

const QUARTERFINALS: BracketMatch[] = [
  { home: 'Maroc', away: 'France', homeScore: 0, awayScore: 2 },
  { home: 'Espagne', away: 'Belgique', homeScore: 2, awayScore: 1 },
  { home: 'Norvège', away: 'Angleterre', homeScore: 1, awayScore: 2 },
  { home: 'Argentine', away: 'Suisse', homeScore: 3, awayScore: 1 },
];

const SEMIFINALS: BracketMatch[] = [
  { home: 'France', away: 'Espagne', homeScore: 0, awayScore: 2 },
  { home: 'Angleterre', away: 'Argentine', homeScore: 1, awayScore: 2 },
];

const FINAL: BracketMatch = {
  home: 'Espagne',
  away: 'Argentine',
  homeScore: 1,
  awayScore: 0,
};
const THIRD_PLACE: BracketMatch = {
  home: 'France',
  away: 'Angleterre',
  homeScore: 4,
  awayScore: 6,
};

function findResult(
  pool: BracketMatch[],
  homeName: string,
  awayName: string,
): {
  homeScore: number;
  awayScore: number;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
} {
  const exact = pool.find((m) => m.home === homeName && m.away === awayName);
  if (exact) {
    return {
      homeScore: exact.homeScore,
      awayScore: exact.awayScore,
      homePenaltyScore: exact.homePenaltyScore,
      awayPenaltyScore: exact.awayPenaltyScore,
    };
  }
  const reversed = pool.find((m) => m.home === awayName && m.away === homeName);
  if (reversed) {
    return {
      homeScore: reversed.awayScore,
      awayScore: reversed.homeScore,
      homePenaltyScore: reversed.awayPenaltyScore,
      awayPenaltyScore: reversed.homePenaltyScore,
    };
  }
  throw new Error(
    `No real result recorded for ${homeName} vs ${awayName} -- bracket slot order is wrong.`,
  );
}

async function playRound(
  token: string,
  orgId: string,
  tournamentId: string,
  bracketId: string,
  round: number,
  pool: BracketMatch[],
) {
  const matches: any[] = await api(
    'GET',
    `/organizations/${orgId}/tournaments/${tournamentId}/knockout-brackets/${bracketId}/matches`,
    token,
  );
  const roundMatches = matches
    .filter((m) => m.round === round && !m.isThirdPlaceMatch)
    .sort((a, b) => a.bracketSlot - b.bracketSlot);
  for (const match of roundMatches) {
    const result = findResult(pool, match.homeTeam.name, match.awayTeam.name);
    await api(
      'PUT',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${match.id}/score`,
      token,
      result,
    );
    await api(
      'POST',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${match.id}/score/validate`,
      token,
    );
  }
  return matches;
}

async function playFinalAndThirdPlace(
  token: string,
  orgId: string,
  tournamentId: string,
  bracketId: string,
  round: number,
) {
  const matches: any[] = await api(
    'GET',
    `/organizations/${orgId}/tournaments/${tournamentId}/knockout-brackets/${bracketId}/matches`,
    token,
  );
  const final = matches.find((m) => m.round === round && !m.isThirdPlaceMatch);
  const thirdPlace = matches.find(
    (m) => m.round === round && m.isThirdPlaceMatch,
  );
  {
    const result = findResult(
      [FINAL],
      final.homeTeam.name,
      final.awayTeam.name,
    );
    await api(
      'PUT',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${final.id}/score`,
      token,
      result,
    );
    await api(
      'POST',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${final.id}/score/validate`,
      token,
    );
  }
  {
    const result = findResult(
      [THIRD_PLACE],
      thirdPlace.homeTeam.name,
      thirdPlace.awayTeam.name,
    );
    await api(
      'PUT',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${thirdPlace.id}/score`,
      token,
      result,
    );
    await api(
      'POST',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${thirdPlace.id}/score/validate`,
      token,
    );
  }
}

async function main() {
  const stamp = Date.now();
  const email = `demo-nations-2026-${stamp}@example.com`;
  const password = 'a-very-strong-password';

  const organizationName = `TournArena Demo ${stamp}`;
  console.log(`Registering organization (${email})…`);
  await api('POST', '/auth/register', null, {
    email,
    password,
    organizationName,
    firstName: 'Demo',
    lastName: 'TournArena',
  });

  // Accounts are no longer auto-logged-in on register() (mandatory email
  // verification, see docs/product/pull-request-plan.md's feat/095 entry).
  // This script already has a raw Prisma connection (see the round-of-32
  // write below) -- reused here to mark the account verified directly,
  // rather than adding a Mailhog dependency for a one-off local seed run.
  console.log('Marking the seed account verified…');
  const authPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await authPrisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
  } finally {
    await authPrisma.$disconnect();
  }

  const login: any = await api('POST', '/auth/login', null, {
    email,
    password,
  });
  const token = login.accessToken;
  const me: any = await api('GET', '/auth/me', token);
  const orgId = me.organizations[0].id;

  const sports: any[] = await api('GET', '/sports', token);
  const football = sports.find((s) => s.name === 'Football');
  if (!football) throw new Error('Sport not found: Football');

  const tournament: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments`,
    token,
    {
      name: 'Coupe des Nations TournArena 2026',
      sportId: football.id,
      theme: 'PULSE_EMBER',
      startDate: '2026-06-11',
      endDate: '2026-07-19',
    },
  );
  const tournamentId = tournament.id;

  const venue: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/venues`,
    token,
    {
      name: 'Stades Canada-Mexique-États-Unis',
    },
  );
  const field: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/venues/${venue.id}/fields`,
    token,
    { name: 'Terrain principal' },
  );

  const category: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/categories`,
    token,
    {
      name: 'Sélections nationales',
    },
  );

  const groupPhase: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/categories/${category.id}/phases`,
    token,
    { name: 'Phase de groupes', type: 'GROUP_STAGE' },
  );

  console.log('Creating 12 groups and 48 teams…');
  const teamIdByName = new Map<string, string>();
  const groupById: { group: any; def: GroupDef }[] = [];
  for (const def of GROUPS) {
    const group: any = await api(
      'POST',
      `/organizations/${orgId}/tournaments/${tournamentId}/phases/${groupPhase.id}/groups`,
      token,
      { name: def.name },
    );
    groupById.push({ group, def });
    for (const name of def.teams) {
      const team: any = await api(
        'POST',
        `/organizations/${orgId}/tournaments/${tournamentId}/teams`,
        token,
        {
          name,
          categoryId: category.id,
        },
      );
      teamIdByName.set(name, team.id);
      await api(
        'PATCH',
        `/organizations/${orgId}/tournaments/${tournamentId}/teams/${team.id}/group`,
        token,
        { groupId: group.id },
      );
      await uploadTeamLogo(token, orgId, tournamentId, team.id, name);
    }
  }

  console.log(
    'Generating group-stage schedule and entering the 72 real results…',
  );
  const groupMatches: any[] = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/phases/${groupPhase.id}/generate-schedule`,
    token,
    { fieldIds: [field.id], startDateTime: '2026-06-11T18:00:00.000Z' },
  );
  const allGroupResults = GROUPS.flatMap((g) => g.matches);
  for (const match of groupMatches) {
    const result = findResult(
      allGroupResults,
      match.homeTeam.name,
      match.awayTeam.name,
    );
    await api(
      'PUT',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${match.id}/score`,
      token,
      result,
    );
    await api(
      'POST',
      `/organizations/${orgId}/tournaments/${tournamentId}/matches/${match.id}/score/validate`,
      token,
    );
  }

  console.log('Creating knockout phase, qualification rules and bracket…');
  const knockoutPhase: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/categories/${category.id}/phases`,
    token,
    { name: 'Phase à élimination directe', type: 'KNOCKOUT' },
  );
  for (const { group, def } of groupById) {
    await api(
      'POST',
      `/organizations/${orgId}/tournaments/${tournamentId}/groups/${group.id}/qualification-rules`,
      token,
      { fromPosition: 1, toPosition: 2, targetPhaseId: knockoutPhase.id },
    );
    if (def.thirdQualifies) {
      await api(
        'POST',
        `/organizations/${orgId}/tournaments/${tournamentId}/groups/${group.id}/qualification-rules`,
        token,
        { fromPosition: 3, toPosition: 3, targetPhaseId: knockoutPhase.id },
      );
    }
  }
  const bracket: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/phases/${knockoutPhase.id}/knockout-bracket`,
    token,
    { name: 'Tableau final', size: 32, hasRankingMatch: true },
  );

  console.log(
    'Generating the full bracket skeleton (all 5 rounds -- placeholder-only past round 1)…',
  );
  await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/knockout-brackets/${bracket.id}/generate-matches`,
    token,
    {},
  );

  console.log(
    "Overwriting the round of 32's generic seeding with the real pairings (no generic-seeding API produces FIFA's actual draw)…",
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const round1Matches = await prisma.match.findMany({
      where: {
        knockoutBracketId: bracket.id,
        round: 1,
        isThirdPlaceMatch: false,
      },
      orderBy: { bracketSlot: 'asc' },
    });
    if (round1Matches.length !== ROUND_OF_32.length) {
      throw new Error(
        `Expected ${ROUND_OF_32.length} round-of-32 matches from generate-matches, found ${round1Matches.length}.`,
      );
    }
    for (const [slot, m] of ROUND_OF_32.entries()) {
      await prisma.match.update({
        where: { id: round1Matches[slot].id },
        data: {
          homeTeamId: teamIdByName.get(m.home)!,
          awayTeamId: teamIdByName.get(m.away)!,
          // generate-matches's generic seeding left these set (the "Vainqueur
          // Poule X" style labels only apply to later rounds here, but round
          // 1 can get its own placeholder label when a slot's qualifier
          // isn't resolved yet -- moot at this point in the script, group
          // stage is already fully played, but clearing them regardless
          // keeps this consistent with how tryAdvanceRound itself resolves a
          // slot below).
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('Round of 32…');
  await playRound(token, orgId, tournamentId, bracket.id, 1, ROUND_OF_32);
  console.log('Round of 16…');
  await playRound(token, orgId, tournamentId, bracket.id, 2, ROUND_OF_16);
  console.log('Quarterfinals…');
  await playRound(token, orgId, tournamentId, bracket.id, 3, QUARTERFINALS);
  console.log('Semifinals…');
  await playRound(token, orgId, tournamentId, bracket.id, 4, SEMIFINALS);
  console.log('Final and third place match…');
  await playFinalAndThirdPlace(token, orgId, tournamentId, bracket.id, 5);

  console.log('Publishing…');
  const publishResult: any = await api(
    'POST',
    `/organizations/${orgId}/tournaments/${tournamentId}/publish`,
    token,
  );
  // 48 teams lands this in the paid mid tier (TOURNAMENT_PUBLICATION_TIER_*
  // env vars, deliberately kept equal to the real advertised pricing in
  // both local and prod -- see apps/api/.env's comment -- so this is
  // expected here, not a config bug). publish() just opened a real Stripe
  // Checkout session; completing that requires a hosted page + a webhook
  // round-trip, more than a script should automate. This is TournArena's
  // own showcase tournament though (the one "Voir un exemple en direct"
  // links to), not a customer's -- so instead of paying itself, mark its
  // publication order paid directly, the same effect
  // handlePublicationStripeEvent's webhook handler would have produced, then
  // call publish() again: it finds that PAID order up front and publishes
  // immediately (see TournamentsService.publish's `alreadyPaid` check).
  if (publishResult?.status === 'PENDING_PAYMENT') {
    console.log(
      "Paid tier reached (48 teams) -- marking this showcase tournament's own publication order paid…",
    );
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    try {
      const order = await prisma.tournamentPublicationOrder.findFirst({
        where: { tournamentId },
        orderBy: { createdAt: 'desc' },
      });
      if (!order) {
        throw new Error(
          'Expected a TournamentPublicationOrder to exist after a PENDING_PAYMENT response.',
        );
      }
      await prisma.tournamentPublicationOrder.update({
        where: { id: order.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
    } finally {
      await prisma.$disconnect();
    }
    await api(
      'POST',
      `/organizations/${orgId}/tournaments/${tournamentId}/publish`,
      token,
    );
  }

  console.log('\n=== Coupe des Nations TournArena 2026 créée ===');
  console.log(
    `Organisation : ${organizationName} (login : ${email} / ${password})`,
  );
  console.log(`Slug     : ${tournament.slug}`);
  console.log(`Public   : http://localhost:4200/${tournament.slug}`);
  console.log(
    `Admin    : http://localhost:4200/admin/tournaments/${tournament.id}`,
  );
  console.log("Vainqueur : Espagne (1-0 a.p. contre l'Argentine, 19 juillet)");
}

main().catch((error: unknown) => {
  console.error(
    '\nÉchec du seed :',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
