// One-off maintenance script: fills in the fields added to Tournament after
// the "Coupe des Nations TournArena 2026" showcase tournament was originally
// seeded (feat/109 -- description/rules/practicalInfo, feat/096 -- logo) --
// requested directly by the product owner rather than by re-running
// seed-world-cup-2026.ts (which creates a brand-new tournament + org each
// time, not what "update the existing one" means here).
//
// Talks to the database directly (Prisma), not the public API -- there's no
// stored login for the tournament's original seed-run organization to
// authenticate an admin PATCH/upload with, and this is plain column data +
// a file copy, nothing that needs the API's own business logic.
//
// Rebranded 2026-08-28 (Apple App Review guideline 5.2.1 -- the showcase
// tournament's real-World-Cup name/copy plus the actual FIFA World Cup 26
// emblem it carried as a logo both read as unauthorized use of FIFA's brand):
// dropped the LOGO_COPY_FROM_NAME mechanism entirely (its only purpose was
// copying that exact emblem from another tournament's upload) -- this script
// now only ever clears the logo or sets one from an explicit local file, and
// the copy/description/rules text below no longer names or describes the
// real competition.
//
// Usage (from apps/api): npm run build && node dist/prisma/update-world-cup-2026.js
// Env:
//   DATABASE_URL     (required, as usual)
//   UPLOADS_DIR       (default './uploads', same as the app itself)
//   LOGO_SOURCE_FILE  (optional) absolute/cwd-relative path to a PNG file to
//                     use as the tournament's logo. If unset, the logo is
//                     cleared (set to null) rather than left untouched --
//                     this script's one job right now is removing the FIFA
//                     emblem, so "do nothing" is not a safe default here.

import 'dotenv/config';
import { randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Inlined copy of tournaments/slug.util.ts's generateSlug -- deliberately
// not imported from src/ (every other prisma/*.ts maintenance script here
// only ever depends on the generated Prisma client + npm deps, never on
// application code, to keep this directory's own build/rootDir untangled
// from the Nest app's).
const COMBINING_DIACRITICS = /\p{Diacritic}/gu;
function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const suffix = randomBytes(4).toString('hex');
  return base ? `${base}-${suffix}` : suffix;
}

const DESCRIPTION = `La Coupe des Nations TournArena 2026 est un tournoi de démonstration fictif : 48 sélections nationales se disputent un titre imaginaire, réparties en 12 groupes de 4. La compétition se déroule sur plusieurs sites, du 11 juin au 19 juillet 2026, avec 104 matchs au programme jusqu'à la finale.

Le format à 48 équipes réparties en 12 groupes de 4 ouvre la compétition à un grand nombre de sélections et promet une phase de groupes particulièrement dense, avant une phase à élimination directe à 32 équipes qui ne laisse plus aucune place à l'erreur.`;

const RULES = `Phase de groupes : 12 groupes de 4 équipes, chacune affrontant les trois autres une fois (matchs de 2 x 45 minutes). Classement établi selon : 1) points (victoire = 3, nul = 1, défaite = 0), 2) différence de buts, 3) buts marqués, 4) résultats entre équipes à égalité, 5) fair-play, 6) tirage au sort si nécessaire.

Qualification pour les huitièmes de finale : les deux premiers de chaque groupe, ainsi que les 8 meilleures équipes classées troisièmes toutes poules confondues, soit 32 équipes au total.

Phase à élimination directe : du tour des 32 aux demi-finales, chaque match se joue en un match sec. En cas d'égalité à l'issue du temps réglementaire, deux prolongations de 15 minutes sont jouées, suivies d'une séance de tirs au but si nécessaire pour départager les deux équipes.

Effectifs : chaque sélection présente une liste de 26 joueurs, dont trois gardiens de but au minimum.`;

const PRACTICAL_INFO = `Sites : les matchs se déroulent sur plusieurs sites fictifs, du groupe jusqu'à la finale.

Fuseaux horaires : les horaires de coup d'envoi affichés dans le calendrier sont exprimés dans le fuseau du lieu de match, pensez à vérifier la conversion selon votre position.

Cet exemple : ce tournoi de démonstration est un scénario fictif à 48 équipes destiné à illustrer les fonctionnalités de TournArena : phase de groupes, tableau à élimination directe, calendrier et classements générés automatiquement. Il n'est affilié à aucune compétition ou fédération sportive réelle.`;

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? './uploads';

// Matches both the original live name and the rebranded one, so this script
// stays idempotent across the rename itself (this same run both renames the
// row and can be safely re-run afterwards without needing a code change).
const NEW_NAME = 'Coupe des Nations TournArena 2026';
const OLD_NAME = 'Coupe du Monde FIFA 2026';

async function findTournament(prisma: PrismaClient) {
  const candidates = await prisma.tournament.findMany({
    where: { OR: [{ name: { contains: OLD_NAME } }, { name: { contains: NEW_NAME } }] },
    orderBy: { createdAt: 'desc' },
  });
  if (candidates.length === 0) {
    throw new Error(`No "${OLD_NAME}" / "${NEW_NAME}" tournament found.`);
  }
  // Prefer the currently-published one (what the landing page actually
  // features, see TournamentsService.listPublished's own ordering) --
  // falls back to the most recent overall if none are published yet.
  const published = candidates.find((t) => t.status === 'PUBLISHED');
  const target = published ?? candidates[0];
  console.log(
    `Found ${candidates.length} match(es) -- updating ${target.id} (slug: ${target.slug}, status: ${target.status}, created ${target.createdAt.toISOString()}).`,
  );
  return target;
}

/** Returns `undefined` (leave DB value untouched) only when explicitly asked to via SKIP_LOGO -- otherwise always resolves to either a new file's bytes or `null` (clear), since silently leaving a possibly-still-set FIFA emblem in place is not a safe default for this particular script. */
async function resolveLogoBuffer(): Promise<Buffer | null | undefined> {
  if (process.env.SKIP_LOGO) {
    console.log('SKIP_LOGO set -- leaving the current logo untouched.');
    return undefined;
  }
  const sourceFile = process.env.LOGO_SOURCE_FILE;
  if (sourceFile) {
    const absolutePath = resolve(sourceFile);
    console.log(`Using logo file at ${absolutePath}…`);
    return fs.readFile(absolutePath);
  }
  console.log('No LOGO_SOURCE_FILE set -- clearing the logo.');
  return null;
}

/** Mirrors TournamentsService.saveLogoBuffer's exact filename convention/directory layout. */
async function saveLogo(tournamentId: string, buffer: Buffer): Promise<string> {
  const logosDir = join(UPLOADS_DIR, 'tournament-logos');
  await fs.mkdir(logosDir, { recursive: true });
  const filename = `${tournamentId}-${randomUUID()}.png`;
  await fs.writeFile(join(logosDir, filename), buffer);
  return `/uploads/tournament-logos/${filename}`;
}

async function deleteOldLogo(logoUrl: string | null): Promise<void> {
  if (!logoUrl) return;
  const filename = logoUrl.split('/').pop();
  if (!filename) return;
  try {
    await fs.unlink(join(UPLOADS_DIR, 'tournament-logos', filename));
  } catch {
    // Best-effort, same as TournamentsService.deleteLogoFile.
  }
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const tournament = await findTournament(prisma);

    // `undefined` = SKIP_LOGO, leave tournament.logoUrl exactly as-is;
    // `null` = clear; a Buffer = replace. Both `null` and a Buffer delete
    // whatever logo file is currently there first (was previously a real
    // FIFA emblem, see this file's header comment).
    const logoBuffer = await resolveLogoBuffer();
    let logoUrl = tournament.logoUrl;
    if (logoBuffer !== undefined) {
      await deleteOldLogo(tournament.logoUrl);
      logoUrl = logoBuffer ? await saveLogo(tournament.id, logoBuffer) : null;
    }

    // Regenerate the slug too, not just the display name -- the current one
    // (e.g. "coupe-du-monde-fifa-2026-xxxxxxxx") still literally spells out
    // "fifa" in the public URL itself, a live exposure independent of the
    // name field. This does mean any previously-shared/bookmarked link to
    // the old slug 404s afterwards -- acceptable for a showcase/demo page.
    const newSlug =
      tournament.name === NEW_NAME ? tournament.slug : generateSlug(NEW_NAME);

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        name: NEW_NAME,
        slug: newSlug,
        description: DESCRIPTION,
        rules: RULES,
        practicalInfo: PRACTICAL_INFO,
        logoUrl,
      },
    });

    console.log(`\n=== ${NEW_NAME} mise à jour ===`);
    console.log(`Tournoi   : ${tournament.id}`);
    console.log(`Slug      : ${newSlug}${newSlug === tournament.slug ? ' (inchangé)' : ` (était : ${tournament.slug})`}`);
    console.log(`Logo      : ${logoUrl ?? '(aucun)'}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    '\nÉchec de la mise à jour :',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
