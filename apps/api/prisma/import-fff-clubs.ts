// Loads (or refreshes) the FFF club directory -- the FffClub table behind the
// team form's club autocomplete (ClubDirectoryService) -- from a CSV file.
// The FFF publishes no open API: the file comes from the FFF itself (export
// obtained on request). Until the table has rows, the autocomplete falls
// back to the State's company register.
//
// Expected columns (header line, ";" or "," separated, any order):
//   code (FFF affiliation n°), nom, nom_court, commune, code_postal, departement
// Only code and nom are required. Rows are upserted by code, so re-running it
// with a newer file updates names/cities without touching linked teams.
//
// Usage (from apps/api): npm run build && node dist/prisma/import-fff-clubs.js <file.csv>

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const COLUMNS = {
  code: ['code', 'numero', 'numero_fff', 'cl_no', 'affiliation'],
  name: ['nom', 'name'],
  shortName: ['nom_court', 'short_name', 'shortname'],
  city: ['commune', 'ville', 'city'],
  postalCode: ['code_postal', 'cp', 'postal_code'],
  department: ['departement', 'department', 'dept'],
} as const;

function splitLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    throw new Error('Usage: node dist/prisma/import-fff-clubs.js <file.csv>');
  }
  const lines = readFileSync(file, 'utf8')
    .replace(new RegExp('^' + String.fromCharCode(0xfeff)), '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const separator = (lines[0] ?? '').includes(';') ? ';' : ',';
  const header = splitLine(lines[0] ?? '', separator).map((h) =>
    h.toLowerCase(),
  );
  const index = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, names]) => [
      key,
      header.findIndex((h) => (names as readonly string[]).includes(h)),
    ]),
  ) as Record<keyof typeof COLUMNS, number>;
  if (index.code < 0 || index.name < 0) {
    throw new Error(
      `Columns "code" and "nom" are required (got: ${header.join(', ')})`,
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const cell = (cells: string[], key: keyof typeof COLUMNS) =>
    index[key] >= 0 ? cells[index[key]] || null : null;
  let imported = 0;
  let skipped = 0;
  try {
    for (const line of lines.slice(1)) {
      const cells = splitLine(line, separator);
      const code = cell(cells, 'code');
      const name = cell(cells, 'name');
      if (!code || !/^\d{1,10}$/.test(code) || !name) {
        skipped++;
        continue;
      }
      const data = {
        name: name.slice(0, 200),
        shortName: cell(cells, 'shortName'),
        city: cell(cells, 'city'),
        postalCode: cell(cells, 'postalCode'),
        department: cell(cells, 'department'),
      };
      await prisma.fffClub.upsert({
        where: { code },
        create: { code, ...data },
        update: data,
      });
      imported++;
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(`FFF clubs: ${imported} imported/updated, ${skipped} skipped.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
