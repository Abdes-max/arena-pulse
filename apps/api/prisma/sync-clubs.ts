// Keeps the club directories (team form's club autocomplete, tournament's
// organizing club) in line with the source -- SportCorico's club listings,
// used with their agreement (the federations publish no open API). Run
// quarterly by .github/workflows/sync-clubs.yml, or by hand.
//
// - football -> FffClub, keyed by the FFF affiliation n° (read from the
//   crest file name);
// - basketball, handball, rugby, volleyball, tennis -> SportClub, keyed by
//   SportCorico's own club slug, with the crest URL (null when they only
//   have their generic placeholder).
//
// Per sport:
// - new club: created;
// - renamed club, one that moved department or changed crest: updated;
// - club gone from the listing (dissolved, merged): marked dissolvedAt --
//   hidden from the search but kept, since teams may link to it -- and
//   revived if it comes back.
//
// Safety net: if a sport's listing comes back much smaller than its active
// table (source down, format change), nothing is marked dissolved for it.
//
// Only the department listings are read (~100 requests per sport, ~1.5 s
// apart: a few minutes each).
//
// Usage (from apps/api): npm run build && node dist/prisma/sync-clubs.js
// Env: DATABASE_URL; FFF_SYNC_DRY_RUN=1 to only print the changes;
// CLUB_SYNC_SPORTS=handball,rugby to sync only some sports (default: all).

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const SITE = 'https://www.sportcorico.com';
const API = 'https://api.sportcorico.com/api';
const REGIONS = [
  'auvergne-rhone-alpes',
  'bourgogne-franche-comte',
  'bretagne',
  'centre-val-de-loire',
  'corse',
  'grand-est',
  'guadeloupe',
  'guyane',
  'hauts-de-france',
  'ile-de-france',
  'la-reunion',
  'martinique',
  'mayotte',
  'normandie',
  'nouvelle-aquitaine',
  'occitanie',
  'pays-de-la-loire',
  'provence-alpes-cote-dazur',
  'saint-pierre-et-miquelon',
];
// Our directory key (ClubDirectoryService) = SportCorico's sport slug.
const OTHER_SPORTS = [
  'basketball',
  'handball',
  'rugby',
  'volleyball',
  'tennis',
] as const;
const HEADERS = {
  'User-Agent': 'TournArena club directory sync (https://tournarena.com)',
  Accept: 'application/json',
};
// Below this share of the active table, the listing is deemed incomplete.
const MIN_LISTING_RATIO = 0.9;
// SportCorico's stand-in crest for clubs without one of their own.
const PLACEHOLDER_CREST = /ecusson-sportcorico/;
const DRY_RUN = process.env.FFF_SYNC_DRY_RUN === '1';
const ONLY = (process.env.CLUB_SYNC_SPORTS ?? '')
  .split(',')
  .map((sport) => sport.trim())
  .filter(Boolean);

interface ListedClub {
  key: string;
  name: string;
  department: string;
  logoSource: string | null;
}

interface StoredClub {
  key: string;
  name: string;
  department: string | null;
  logoSource: string | null;
  dissolvedAt: Date | null;
}

interface DepartmentListing {
  department?: { code?: string };
  clubs?: {
    data?: { slug?: string; name?: string; logo_filename?: string }[];
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
      if (res.status === 404) {
        return null;
      }
      console.warn(`HTTP ${res.status} on ${url}`);
    } catch (error) {
      console.warn(`${(error as Error).message} on ${url}`);
    }
    await sleep(10_000 * attempt);
  }
  throw new Error(`Giving up on ${url}`);
}

/** Department slugs, read once from the football region pages (same for every sport). */
async function fetchDepartments(): Promise<string[]> {
  const departments = new Set<string>();
  for (const region of REGIONS) {
    const res = await fetch(`${SITE}/clubs-par-region/football/${region}`, {
      headers: HEADERS,
    });
    const html = await res.text();
    const pattern = new RegExp(
      `/clubs-par-region/football/${region}/([a-z0-9-]+)`,
      'g',
    );
    for (const match of html.matchAll(pattern)) {
      departments.add(match[1]);
    }
    await sleep(1000);
  }
  return [...departments];
}

async function fetchListing(
  sport: string,
  departments: string[],
): Promise<Map<string, ListedClub>> {
  const clubs = new Map<string, ListedClub>();
  for (const slug of departments) {
    const listing = await getJson<DepartmentListing>(
      `${API}/departement/${slug}?sport-slug=${sport}&listing-endpoint-slug=clubs-par-region`,
    );
    const department = listing?.department?.code ?? '';
    for (const club of listing?.clubs?.data ?? []) {
      const name = club.name?.trim().slice(0, 200);
      const logo = club.logo_filename?.trim() ?? '';
      if (!name) {
        continue;
      }
      if (sport === 'football') {
        // The FFF affiliation n° ends the crest file name
        // (logo-fc-septemes-consolat-553079.jpg); leagues and districts
        // have 4 digits and are left out.
        const match = /-(\d{5,7})\.[a-z]+$/i.exec(logo);
        if (match) {
          clubs.set(match[1], {
            key: match[1],
            name,
            department,
            logoSource: null,
          });
        }
      } else if (club.slug && /^[a-z0-9-]{1,150}$/.test(club.slug)) {
        clubs.set(club.slug, {
          key: club.slug,
          name,
          department,
          logoSource:
            logo.startsWith('https://') && !PLACEHOLDER_CREST.test(logo)
              ? logo
              : null,
        });
      }
    }
    await sleep(1500);
  }
  console.log(
    `${sport}: ${departments.length} departments, ${clubs.size} clubs`,
  );
  return clubs;
}

/** Applies one sport's listing to its table; returns a one-line summary. */
async function reconcile(
  sport: string,
  listed: Map<string, ListedClub>,
  existing: Map<string, StoredClub>,
  write: {
    upsert: (club: ListedClub) => Promise<unknown>;
    dissolve: (keys: string[]) => Promise<unknown>;
  },
): Promise<string> {
  const activeCount = [...existing.values()].filter(
    (club) => !club.dissolvedAt,
  ).length;

  let created = 0;
  let updated = 0;
  let revived = 0;
  for (const club of listed.values()) {
    const current = existing.get(club.key);
    const renamed = !!current && current.name !== club.name;
    const changed =
      !current ||
      renamed ||
      current.department !== club.department ||
      (sport !== 'football' && current.logoSource !== club.logoSource) ||
      !!current.dissolvedAt;
    if (!changed) {
      continue;
    }
    if (!current) {
      created++;
    } else if (current.dissolvedAt) {
      revived++;
    } else {
      updated++;
    }
    if (renamed) {
      console.log(
        `${sport} renamed ${club.key}: ${current?.name} -> ${club.name}`,
      );
    }
    if (!DRY_RUN) {
      await write.upsert(club);
    }
  }

  const gone = [...existing.values()].filter(
    (club) => !club.dissolvedAt && !listed.has(club.key),
  );
  let dissolved = 0;
  if (activeCount > 0 && listed.size < activeCount * MIN_LISTING_RATIO) {
    console.warn(
      `${sport}: listing has ${listed.size} clubs for ${activeCount} active ones: too few, no club marked dissolved.`,
    );
  } else {
    for (const club of gone) {
      console.log(`${sport} dissolved ${club.key}: ${club.name}`);
    }
    dissolved = gone.length;
    if (!DRY_RUN && gone.length > 0) {
      await write.dissolve(gone.map((club) => club.key));
    }
  }
  return `${DRY_RUN ? '[dry run] ' : ''}${sport}: ${created} created, ${updated} updated, ${revived} revived, ${dissolved} dissolved.`;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const sports = ['football', ...OTHER_SPORTS].filter(
    (sport) => ONLY.length === 0 || ONLY.includes(sport),
  );
  const summaries: string[] = [];
  try {
    const departments = await fetchDepartments();
    for (const sport of sports) {
      const listed = await fetchListing(sport, departments);
      if (sport === 'football') {
        const existing = new Map(
          (await prisma.fffClub.findMany()).map((club) => [
            club.code,
            { ...club, key: club.code, logoSource: null },
          ]),
        );
        summaries.push(
          await reconcile(sport, listed, existing, {
            upsert: (club) => {
              const data = {
                name: club.name,
                department: club.department,
                dissolvedAt: null,
              };
              return prisma.fffClub.upsert({
                where: { code: club.key },
                create: { code: club.key, ...data },
                update: data,
              });
            },
            dissolve: (codes) =>
              prisma.fffClub.updateMany({
                where: { code: { in: codes } },
                data: { dissolvedAt: new Date() },
              }),
          }),
        );
      } else {
        const existing = new Map(
          (await prisma.sportClub.findMany({ where: { sport } })).map(
            (club) => [club.slug, { ...club, key: club.slug }],
          ),
        );
        summaries.push(
          await reconcile(sport, listed, existing, {
            upsert: (club) => {
              const data = {
                name: club.name,
                department: club.department,
                logoSource: club.logoSource,
                dissolvedAt: null,
              };
              return prisma.sportClub.upsert({
                where: { sport_slug: { sport, slug: club.key } },
                create: { sport, slug: club.key, ...data },
                update: data,
              });
            },
            dissolve: (slugs) =>
              prisma.sportClub.updateMany({
                where: { sport, slug: { in: slugs } },
                data: { dissolvedAt: new Date() },
              }),
          }),
        );
      }
    }
    for (const summary of summaries) {
      console.log(summary);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
