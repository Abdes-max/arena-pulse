// One-off maintenance script: fills in the fields added to Tournament after
// the "Coupe du Monde FIFA 2026" showcase tournament was originally seeded
// (feat/109 -- description/rules/practicalInfo, feat/096 -- logo) --
// requested directly by the product owner rather than by re-running
// seed-world-cup-2026.ts (which creates a brand-new tournament + org each
// time, not what "update the existing one" means here).
//
// Talks to the database directly (Prisma), not the public API -- there's no
// stored login for the tournament's original seed-run organization to
// authenticate an admin PATCH/upload with, and this is plain column data +
// a file copy, nothing that needs the API's own business logic.
//
// Usage (from apps/api): npm run build && node dist/prisma/update-world-cup-2026.js
// Env:
//   DATABASE_URL        (required, as usual)
//   UPLOADS_DIR          (default './uploads', same as the app itself)
//   LOGO_SOURCE_FILE     (optional) absolute/cwd-relative path to a PNG file
//                        to use as the tournament's logo.
//   LOGO_COPY_FROM_NAME  (optional) copies the current logo file of another
//                        tournament matched by name (contains, case-
//                        insensitive) instead of LOGO_SOURCE_FILE -- e.g.
//                        prod's "U11 Super league" already has the real
//                        World Cup 26 emblem uploaded to it by the product
//                        owner, so this reuses that exact file rather than
//                        fetching a fresh copy from anywhere. Takes
//                        precedence over LOGO_SOURCE_FILE if both are set.
//                        Both are no-ops (logo step skipped) if neither is set.

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const DESCRIPTION = `La Coupe du Monde FIFA 2026 marque une étape historique : pour la première fois, 48 équipes se disputent le titre mondial, contre 32 lors des éditions précédentes. La compétition est co-organisée par trois pays -- le Canada, le Mexique et les États-Unis -- une première pour un Mondial de football. Du 11 juin au 19 juillet 2026, 104 matchs sont joués dans 16 stades répartis sur les trois pays hôtes, pour désigner le successeur de l'Argentine, championne du monde 2022.

Le format inédit à 48 équipes réparties en 12 groupes de 4 ouvre la compétition à davantage de confédérations et promet une phase de groupes particulièrement dense, avant une phase à élimination directe à 32 équipes qui ne laisse plus aucune place à l'erreur.`;

const RULES = `Phase de groupes : 12 groupes de 4 équipes, chacune affrontant les trois autres une fois (matchs de 2 x 45 minutes). Classement établi selon : 1) points (victoire = 3, nul = 1, défaite = 0), 2) différence de buts, 3) buts marqués, 4) résultats entre équipes à égalité, 5) fair-play, 6) tirage au sort si nécessaire.

Qualification pour les huitièmes de finale : les deux premiers de chaque groupe, ainsi que les 8 meilleures équipes classées troisièmes toutes poules confondues, soit 32 équipes au total.

Phase à élimination directe : du tour des 32 aux demi-finales, chaque match se joue en un match sec. En cas d'égalité à l'issue du temps réglementaire, deux prolongations de 15 minutes sont jouées, suivies d'une séance de tirs au but si nécessaire pour départager les deux équipes.

Effectifs : chaque sélection présente une liste de 26 joueurs, dont trois gardiens de but au minimum.`;

const PRACTICAL_INFO = `Pays hôtes et stades : les matchs se déroulent dans 16 villes du Canada, du Mexique et des États-Unis, du groupe jusqu'à la finale disputée aux États-Unis. Le Mexique et le Canada accueillent uniquement des matchs jusqu'aux quarts de finale inclus.

Fuseaux horaires : les trois pays hôtes couvrent plusieurs fuseaux ; les horaires de coup d'envoi affichés dans le calendrier sont exprimés dans le fuseau du lieu de match, pensez à vérifier la conversion selon votre position.

Billetterie et diffusion : les billets sont mis en vente par phases via la billetterie officielle FIFA ; la compétition est retransmise par les diffuseurs officiels de chaque pays.

Cet exemple : ce tournoi de démonstration reproduit les résultats réels de la compétition (source : Wikipédia, recoupée avec les comptes rendus ESPN et FIFA) pour illustrer les fonctionnalités de TournArena : phase de groupes, tableau à élimination directe, calendrier et classements générés automatiquement.`;

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? './uploads';

async function findTournament(prisma: PrismaClient) {
  const candidates = await prisma.tournament.findMany({
    where: { name: { contains: 'Coupe du Monde FIFA 2026' } },
    orderBy: { createdAt: 'desc' },
  });
  if (candidates.length === 0) {
    throw new Error('No "Coupe du Monde FIFA 2026" tournament found.');
  }
  // Prefer the currently-published one (what the landing page actually
  // features, see TournamentsService.listPublished's own ordering) --
  // falls back to the most recent overall if none are published yet.
  const published = candidates.find((t) => t.status === 'PUBLISHED');
  const target = published ?? candidates[0];
  console.log(
    `Found ${candidates.length} match(es) for "Coupe du Monde FIFA 2026" -- updating ${target.id} (slug: ${target.slug}, status: ${target.status}, created ${target.createdAt.toISOString()}).`,
  );
  return target;
}

async function resolveLogoBuffer(prisma: PrismaClient): Promise<Buffer | null> {
  const copyFromName = process.env.LOGO_COPY_FROM_NAME;
  if (copyFromName) {
    // Plain JS filtering rather than Prisma's `mode: 'insensitive'` --
    // untested with this project's @prisma/adapter-pg driver adapter setup,
    // and this only ever runs against a handful of tournaments so there's
    // no performance reason to push the filter into SQL.
    const all = await prisma.tournament.findMany();
    const needle = copyFromName.toLowerCase();
    const source = all.find((t) => t.name.toLowerCase().includes(needle));
    if (!source?.logoUrl) {
      throw new Error(
        `LOGO_COPY_FROM_NAME="${copyFromName}" matched no tournament with a logo.`,
      );
    }
    const relativePath = source.logoUrl.replace(/^\/uploads\//, '');
    const absolutePath = join(UPLOADS_DIR, relativePath);
    console.log(`Copying logo from "${source.name}" (${absolutePath})…`);
    return fs.readFile(absolutePath);
  }
  const sourceFile = process.env.LOGO_SOURCE_FILE;
  if (sourceFile) {
    const absolutePath = resolve(sourceFile);
    console.log(`Using logo file at ${absolutePath}…`);
    return fs.readFile(absolutePath);
  }
  console.log('No LOGO_COPY_FROM_NAME/LOGO_SOURCE_FILE set -- skipping logo.');
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

    const logoBuffer = await resolveLogoBuffer(prisma);
    let logoUrl = tournament.logoUrl;
    if (logoBuffer) {
      logoUrl = await saveLogo(tournament.id, logoBuffer);
      await deleteOldLogo(tournament.logoUrl);
    }

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        description: DESCRIPTION,
        rules: RULES,
        practicalInfo: PRACTICAL_INFO,
        logoUrl,
      },
    });

    console.log('\n=== Coupe du Monde FIFA 2026 mise à jour ===');
    console.log(`Tournoi   : ${tournament.id}`);
    console.log(`Slug      : ${tournament.slug}`);
    console.log(`Logo      : ${logoUrl ?? '(inchangé/aucun)'}`);
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
