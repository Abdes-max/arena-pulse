// Seeds a fully customized, finished example padel tournament -- "Open Padel
// Sainte-Victoire 2026" (12 fictional pairs, 2 pools of 6, semifinals +
// final + 3rd place) -- to show what a padel event looks like on TournArena:
// logo, poster, Neon Court theme + matching header background, description/
// rules/practical info, sponsors, a scheduled day on 3 courts and every
// result entered and validated.
//
// Same approach as seed-world-cup-2026.ts: everything goes through the
// public API except the two things a script can't do through it -- marking
// the demo account's email verified, and marking its publication order paid
// (12 pairs is past the free tier; this is TournArena's own showcase, not a
// customer's, so it doesn't pay itself through Stripe).
//
// Scores are entered set by set (padel is played in 2 winning sets, the 3rd
// being a 10-point super tie-break), e.g. 6-4 3-6 10-7 -- the API derives the
// sets won (homeScore/awayScore) from them. The stronger pair always wins,
// which keeps the pool standings free of ties an organizer would have to
// settle by hand.
//
// Re-running it first removes the previous demo organization (same exact
// name), so the example never piles up in production.
//
// Usage (from apps/api): npm run build && node dist/prisma/seed-padel-example.js
// Env: API_URL (default http://localhost:3000/api/v1). Assets are read from
// prisma/assets/padel/ relative to the working directory (apps/api, or /app
// in the migrate image -- see .github/workflows/seed-padel-example.yml).

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const API = process.env.API_URL ?? 'http://localhost:3000/api/v1';
const ASSETS_DIR = join(process.cwd(), 'prisma', 'assets', 'padel');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Same pacing as seed-world-cup-2026.ts -- stays under the API's global rate
// limit (100 req/60s) instead of bursting through it.
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

async function upload(
  path: string,
  token: string,
  field: string,
  fileName: string,
  mimeType: string,
) {
  await sleep(API_CALL_DELAY_MS);
  const form = new FormData();
  form.append(
    field,
    new Blob([readFileSync(join(ASSETS_DIR, fileName))], { type: mimeType }),
    fileName,
  );
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} -> ${res.status}: ${text}`);
  }
}

interface Pair {
  name: string;
  players: [string, string][];
  // Higher wins -- the whole tournament's results derive from this.
  strength: number;
}

// Fictional pairs (team name = the two players' last names, padel style).
const POOLS: { name: string; pairs: Pair[] }[] = [
  {
    name: 'Poule A',
    pairs: [
      {
        name: 'Moreau / Ferreira',
        strength: 96,
        players: [
          ['Lucas', 'Moreau'],
          ['Diego', 'Ferreira'],
        ],
      },
      {
        name: 'Lambert / Ortiz',
        strength: 88,
        players: [
          ['Hugo', 'Lambert'],
          ['Pablo', 'Ortiz'],
        ],
      },
      {
        name: 'Garnier / Costa',
        strength: 81,
        players: [
          ['Inès', 'Garnier'],
          ['Marta', 'Costa'],
        ],
      },
      {
        name: 'Roux / Benali',
        strength: 74,
        players: [
          ['Théo', 'Roux'],
          ['Karim', 'Benali'],
        ],
      },
      {
        name: 'Fabre / Lefèvre',
        strength: 66,
        players: [
          ['Camille', 'Fabre'],
          ['Julie', 'Lefèvre'],
        ],
      },
      {
        name: 'Blanc / Navarro',
        strength: 58,
        players: [
          ['Nathan', 'Blanc'],
          ['Álvaro', 'Navarro'],
        ],
      },
    ],
  },
  {
    name: 'Poule B',
    pairs: [
      {
        name: 'Vidal / Marchetti',
        strength: 94,
        players: [
          ['Enzo', 'Vidal'],
          ['Luca', 'Marchetti'],
        ],
      },
      {
        name: 'Chevalier / Ruiz',
        strength: 87,
        players: [
          ['Léa', 'Chevalier'],
          ['Sofía', 'Ruiz'],
        ],
      },
      {
        name: 'Mercier / Haddad',
        strength: 79,
        players: [
          ['Maxime', 'Mercier'],
          ['Yanis', 'Haddad'],
        ],
      },
      {
        name: 'Perrin / Santos',
        strength: 71,
        players: [
          ['Chloé', 'Perrin'],
          ['Ana', 'Santos'],
        ],
      },
      {
        name: 'Giraud / Morel',
        strength: 64,
        players: [
          ['Antoine', 'Giraud'],
          ['Paul', 'Morel'],
        ],
      },
      {
        name: 'Faure / Delgado',
        strength: 55,
        players: [
          ['Manon', 'Faure'],
          ['Lucía', 'Delgado'],
        ],
      },
    ],
  },
];

const STRENGTH = new Map(
  POOLS.flatMap((pool) => pool.pairs.map((p) => [p.name, p.strength] as const)),
);

// Winning set scores for a padel set (winner games first), picked
// deterministically per match so a re-run produces the same results.
const WINNING_SETS: [number, number][] = [
  [6, 4],
  [6, 3],
  [6, 2],
  [7, 5],
  [6, 1],
  [7, 6],
];
const SUPER_TIEBREAKS: [number, number][] = [
  [10, 7],
  [10, 8],
  [10, 5],
  [11, 9],
];

function hashOf(text: string): number {
  let hash = 7;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

// Sets for one match: the stronger pair wins, 2-0 when clearly better, 2-1
// (decided by a super tie-break) when close.
function resultFor(homeName: string, awayName: string) {
  const home = STRENGTH.get(homeName);
  const away = STRENGTH.get(awayName);
  if (home === undefined || away === undefined) {
    throw new Error(`Unknown pair in "${homeName}" vs "${awayName}"`);
  }
  const homeWins = home > away;
  const seed = hashOf(`${homeName}|${awayName}`);
  const pick = (offset: number) =>
    WINNING_SETS[(seed + offset) % WINNING_SETS.length];
  // [winner, loser] games of each set, from the winner's point of view.
  let sets: [number, number][];
  if (Math.abs(home - away) >= 12) {
    sets = [pick(0), pick(1)];
  } else {
    const lostSet = pick(2);
    const superTiebreak = SUPER_TIEBREAKS[seed % SUPER_TIEBREAKS.length];
    // The winner takes the first or the second set, then the super tie-break.
    sets =
      seed % 2 === 0
        ? [pick(0), [lostSet[1], lostSet[0]], superTiebreak]
        : [[lostSet[1], lostSet[0]], pick(0), superTiebreak];
  }
  const setsHomeFirst = sets.map(([winner, loser]) =>
    homeWins ? { home: winner, away: loser } : { home: loser, away: winner },
  );
  const winnerSets = 2;
  const loserSets = sets.length - winnerSets;
  return {
    homeScore: homeWins ? winnerSets : loserSets,
    awayScore: homeWins ? loserSets : winnerSets,
    sets: setsHomeFirst,
  };
}

const DESCRIPTION = `L'Open Padel Sainte-Victoire réunit 12 paires pour un week-end de padel au pied de la montagne Sainte-Victoire.

Samedi : phase de poules (2 poules de 6, chaque paire joue 5 matchs).
Dimanche : demi-finales, petite finale et finale.

Ce tournoi est un exemple de démonstration TournArena : les paires, les joueurs et les partenaires sont fictifs.`;

const RULES = `- Matchs en 2 sets gagnants, jeu décisif à 6-6, super tie-break à 10 points au 3e set.
- Point en or (punto de oro) à 40-40.
- Victoire = 3 points au classement de poule, défaite = 0.
- Départage : confrontation directe, puis différence de sets.
- Les 2 premières paires de chaque poule sont qualifiées pour les demi-finales.
- Échauffement : 5 minutes avant chaque match.`;

const PRACTICAL_INFO = `Accueil des joueurs dès 8h30 au club-house.
Parking gratuit sur place, vestiaires et douches disponibles.
Buvette et restauration rapide toute la journée.
Balles fournies par l'organisation (3 balles neuves par match).
Remise des prix dimanche à 17h30 sur la piste centrale.`;

// Deletes the organization(s) a previous run created (matched on the exact
// demo name -- never anything else) and their seed accounts. Matches go first:
// a plain organization delete can trip Postgres's cascade ordering on
// scheduled matches (same workaround as SuperAdminOrganizationsService.
// deleteOrganizationCascade).
async function removePreviousDemo(
  prisma: PrismaClient,
  organizationName: string,
): Promise<void> {
  const previous = await prisma.organization.findMany({
    where: { name: organizationName },
    select: { id: true },
  });
  for (const { id: organizationId } of previous) {
    console.log(`Removing previous demo organization ${organizationId}…`);
    await prisma.$transaction([
      prisma.match.deleteMany({
        where: {
          OR: [
            {
              group: {
                phase: { category: { tournament: { organizationId } } },
              },
            },
            {
              knockoutBracket: {
                phase: { category: { tournament: { organizationId } } },
              },
            },
          ],
        },
      }),
      prisma.organization.delete({ where: { id: organizationId } }),
    ]);
  }
  const { count } = await prisma.user.deleteMany({
    where: { email: { startsWith: 'demo-padel-', endsWith: '@example.com' } },
  });
  if (count > 0) {
    console.log(`Removed ${count} previous demo account(s).`);
  }
}

async function main() {
  const stamp = Date.now();
  const email = `demo-padel-${stamp}@example.com`;
  const password = 'a-very-strong-password';
  const organizationName = 'Padel Arena Sainte-Victoire (démo)';

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await removePreviousDemo(prisma, organizationName);

    console.log(`Registering organization (${email})…`);
    await api('POST', '/auth/register', null, {
      email,
      password,
      organizationName,
      firstName: 'Démo',
      lastName: 'Padel',
    });

    console.log('Marking the seed account verified…');
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    // Demo data: kept out of the super-admin dashboard figures by default.
    await prisma.organization.updateMany({
      where: { name: organizationName },
      data: { isTest: true },
    });

    const login: any = await api('POST', '/auth/login', null, {
      email,
      password,
    });
    const token: string = login.accessToken;
    const me: any = await api('GET', '/auth/me', token);
    const orgId: string = me.organizations[0].id;
    const base = `/organizations/${orgId}`;

    const sports: any[] = await api('GET', '/sports', token);
    const padel = sports.find((s) => s.name === 'Padel');
    if (!padel)
      throw new Error('Sport not found: Padel (run prisma db seed first)');

    const tournament: any = await api('POST', `${base}/tournaments`, token, {
      name: 'Open Padel Sainte-Victoire 2026',
      sportId: padel.id,
      startDate: '2026-10-31',
      endDate: '2026-11-01',
    });
    const t = `${base}/tournaments/${tournament.id}`;

    console.log('Venue, courts and sponsors…');
    const venue: any = await api('POST', `${t}/venues`, token, {
      name: 'Padel Arena Sainte-Victoire',
      address: "Avenue de l'Arc de Meyreuil, 13100 Aix-en-Provence, France",
    });
    const fieldIds: string[] = [];
    for (const name of ['Piste centrale', 'Piste 2', 'Piste 3']) {
      const field: any = await api(
        'POST',
        `${t}/venues/${venue.id}/fields`,
        token,
        {
          name,
          surface: 'Gazon synthétique',
        },
      );
      fieldIds.push(field.id);
    }
    for (const name of [
      'Boulangerie du Cours',
      'Optique Mirabeau',
      'Cave des Calissons',
    ]) {
      await api('POST', `${t}/sponsors`, token, { name });
    }

    const category: any = await api('POST', `${t}/categories`, token, {
      name: 'Mixte P250',
    });
    const poolPhase: any = await api(
      'POST',
      `${t}/categories/${category.id}/phases`,
      token,
      {
        name: 'Phase de poules',
        type: 'GROUP_STAGE',
        matchDurationMinutes: 45,
        breakDurationMinutes: 10,
      },
    );

    console.log('Creating 2 pools and 12 pairs (with their players)…');
    const groups: any[] = [];
    for (const pool of POOLS) {
      const group: any = await api(
        'POST',
        `${t}/phases/${poolPhase.id}/groups`,
        token,
        { name: pool.name },
      );
      groups.push(group);
      for (const pair of pool.pairs) {
        const team: any = await api('POST', `${t}/teams`, token, {
          name: pair.name,
          categoryId: category.id,
        });
        await api('PATCH', `${t}/teams/${team.id}/group`, token, {
          groupId: group.id,
        });
        for (const [index, [firstName, lastName]] of pair.players.entries()) {
          await api('POST', `${t}/teams/${team.id}/players`, token, {
            firstName,
            lastName,
            isCaptain: index === 0,
          });
        }
      }
    }

    // Past the free tier's team count now, so the premium customization
    // (theme, logo, header background, poster) is unlocked.
    console.log('Customizing: theme, logo, header background, poster, texts…');
    await api('PATCH', t, token, {
      theme: 'NEON_COURT',
      description: DESCRIPTION,
      rules: RULES,
      practicalInfo: PRACTICAL_INFO,
    });
    await upload(`${t}/logo`, token, 'logo', 'logo.png', 'image/png');
    await upload(`${t}/poster`, token, 'poster', 'poster.jpg', 'image/jpeg');
    await api('PUT', `${t}/header-background/preset`, token, {
      preset: 'violet',
    });

    console.log('Saturday: pool schedule on 3 courts and every result…');
    const poolMatches: any[] = await api(
      'POST',
      `${t}/phases/${poolPhase.id}/generate-schedule`,
      token,
      { fieldIds, startDateTime: '2026-10-31T08:00:00.000Z' },
    );
    for (const match of poolMatches) {
      await api(
        'PUT',
        `${t}/matches/${match.id}/score`,
        token,
        resultFor(match.homeTeam.name, match.awayTeam.name),
      );
      await api('POST', `${t}/matches/${match.id}/score/validate`, token);
    }

    console.log('Sunday: semifinals, 3rd place and final…');
    const finalPhase: any = await api(
      'POST',
      `${t}/categories/${category.id}/phases`,
      token,
      {
        name: 'Phases finales',
        type: 'KNOCKOUT',
        matchDurationMinutes: 60,
        breakDurationMinutes: 15,
      },
    );
    for (const group of groups) {
      await api('POST', `${t}/groups/${group.id}/qualification-rules`, token, {
        fromPosition: 1,
        toPosition: 2,
        targetPhaseId: finalPhase.id,
      });
    }
    const bracket: any = await api(
      'POST',
      `${t}/phases/${finalPhase.id}/knockout-bracket`,
      token,
      { name: 'Tableau final', size: 4, hasRankingMatch: true },
    );
    await api(
      'POST',
      `${t}/knockout-brackets/${bracket.id}/generate-matches`,
      token,
      { fieldIds: [fieldIds[0]], startDateTime: '2026-11-01T09:00:00.000Z' },
    );

    // Round 1 (semifinals), then round 2 (final + 3rd place) -- re-read
    // after each round, since validating a semifinal is what fills the
    // final's and 3rd-place match's teams in.
    for (const round of [1, 2]) {
      const matches: any[] = await api(
        'GET',
        `${t}/knockout-brackets/${bracket.id}/matches`,
        token,
      );
      for (const match of matches.filter((m) => m.round === round)) {
        if (!match.homeTeam || !match.awayTeam) {
          throw new Error(`Round ${round} match ${match.id} has no teams yet.`);
        }
        await api(
          'PUT',
          `${t}/matches/${match.id}/score`,
          token,
          resultFor(match.homeTeam.name, match.awayTeam.name),
        );
        await api('POST', `${t}/matches/${match.id}/score/validate`, token);
      }
    }

    console.log('Publishing…');
    const publishResult: any = await api('POST', `${t}/publish`, token);
    if (publishResult?.status === 'PENDING_PAYMENT') {
      // 12 pairs is the paid mid tier -- same showcase shortcut as
      // seed-world-cup-2026.ts: mark the order paid, then publish again.
      const order = await prisma.tournamentPublicationOrder.findFirst({
        where: { tournamentId: tournament.id },
        orderBy: { createdAt: 'desc' },
      });
      if (!order) {
        throw new Error('Expected a publication order after PENDING_PAYMENT.');
      }
      await prisma.tournamentPublicationOrder.update({
        where: { id: order.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
      await api('POST', `${t}/publish`, token);
    }

    console.log('\n=== Open Padel Sainte-Victoire 2026 créé ===');
    console.log(`Organisation : ${organizationName} (login : ${email})`);
    console.log(`Slug         : ${tournament.slug}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    '\nÉchec du seed :',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
