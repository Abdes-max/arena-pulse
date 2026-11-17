// Keeps the FffClub directory (team form's club autocomplete) in line with
// the source -- SportCorico's football club listing, used with their
// agreement (the FFF publishes no open API). Run quarterly by
// .github/workflows/sync-fff-clubs.yml, or by hand.
//
// - new club (affiliation n° not in the table): created;
// - renamed club, or one that moved department: updated;
// - club gone from the listing (dissolved, merged into a new n°): marked
//   dissolvedAt -- hidden from the search but kept, since teams may link to
//   it -- and revived if it comes back.
//
// Safety net: if the listing comes back much smaller than the active table
// (source down, format change), nothing is marked dissolved.
//
// Only the department listings are read (~120 requests, ~1.5 s apart: a few
// minutes) -- the club's city/postal code would need every club page and
// was deliberately left out (the department tells homonyms apart well enough).
//
// Usage (from apps/api): npm run build && node dist/prisma/sync-fff-clubs.js
// Env: DATABASE_URL; FFF_SYNC_DRY_RUN=1 to only print the changes.

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
const HEADERS = {
  'User-Agent': 'TournArena club directory sync (https://tournarena.com)',
  Accept: 'application/json',
};
// Below this share of the active table, the listing is deemed incomplete.
const MIN_LISTING_RATIO = 0.9;
const DRY_RUN = process.env.FFF_SYNC_DRY_RUN === '1';

interface ListedClub {
  code: string;
  name: string;
  department: string;
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

async function fetchListing(): Promise<Map<string, ListedClub>> {
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

  const clubs = new Map<string, ListedClub>();
  for (const slug of departments) {
    const listing = await getJson<DepartmentListing>(
      `${API}/departement/${slug}?sport-slug=football&listing-endpoint-slug=clubs-par-region`,
    );
    const department = listing?.department?.code ?? '';
    for (const club of listing?.clubs?.data ?? []) {
      // The FFF affiliation n° ends the crest file name
      // (logo-fc-septemes-consolat-553079.jpg); leagues and districts have
      // 4 digits and are left out.
      const match = /-(\d{5,7})\.[a-z]+$/i.exec(club.logo_filename ?? '');
      if (match && club.name?.trim()) {
        clubs.set(match[1], {
          code: match[1],
          name: club.name.trim().slice(0, 200),
          department,
        });
      }
    }
    await sleep(1500);
  }
  console.log(`Listing: ${departments.size} departments, ${clubs.size} clubs`);
  return clubs;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const listed = await fetchListing();
    const existing = new Map(
      (await prisma.fffClub.findMany()).map((club) => [club.code, club]),
    );
    const activeCount = [...existing.values()].filter(
      (club) => !club.dissolvedAt,
    ).length;

    let created = 0;
    let updated = 0;
    let revived = 0;
    for (const club of listed.values()) {
      const current = existing.get(club.code);
      const renamed = !!current && current.name !== club.name;
      const changed =
        !current ||
        renamed ||
        current.department !== club.department ||
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
        console.log(`Renamed ${club.code}: ${current?.name} -> ${club.name}`);
      }
      if (!DRY_RUN) {
        const data = {
          name: club.name,
          department: club.department,
          dissolvedAt: null,
        };
        await prisma.fffClub.upsert({
          where: { code: club.code },
          create: { code: club.code, ...data },
          update: data,
        });
      }
    }

    const gone = [...existing.values()].filter(
      (club) => !club.dissolvedAt && !listed.has(club.code),
    );
    let dissolved = 0;
    if (activeCount > 0 && listed.size < activeCount * MIN_LISTING_RATIO) {
      console.warn(
        `Listing has ${listed.size} clubs for ${activeCount} active ones: too few, no club marked dissolved.`,
      );
    } else {
      for (const club of gone) {
        console.log(`Dissolved ${club.code}: ${club.name}`);
      }
      dissolved = gone.length;
      if (!DRY_RUN && gone.length > 0) {
        await prisma.fffClub.updateMany({
          where: { code: { in: gone.map((club) => club.code) } },
          data: { dissolvedAt: new Date() },
        });
      }
    }

    console.log(
      `${DRY_RUN ? '[dry run] ' : ''}FFF clubs: ${created} created, ${updated} updated, ${revived} revived, ${dissolved} dissolved.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
