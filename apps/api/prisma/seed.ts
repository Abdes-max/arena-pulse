import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Esport added alongside the physical sports (feat/099) -- Tournament.isOnline
// already existed as a generic per-tournament flag, but no Sport row let an
// organizer actually pick "esport" as the sport itself before this.
// Sets sports record each set (see ScoreFormat in schema.prisma); the rest keep
// a single score per side. defaultSetsToWin = sets needed to take the match:
// padel/tennis/badminton are best of 3, volleyball best of 5.
const SPORTS: {
  name: string;
  scoreFormat: 'GOALS' | 'SETS';
  defaultSetsToWin: number | null;
}[] = [
  { name: 'Football', scoreFormat: 'GOALS', defaultSetsToWin: null },
  { name: 'Basketball', scoreFormat: 'GOALS', defaultSetsToWin: null },
  { name: 'Volleyball', scoreFormat: 'SETS', defaultSetsToWin: 3 },
  { name: 'Handball', scoreFormat: 'GOALS', defaultSetsToWin: null },
  { name: 'Rugby', scoreFormat: 'GOALS', defaultSetsToWin: null },
  { name: 'Tennis', scoreFormat: 'SETS', defaultSetsToWin: 2 },
  { name: 'Badminton', scoreFormat: 'SETS', defaultSetsToWin: 2 },
  { name: 'Futsal', scoreFormat: 'GOALS', defaultSetsToWin: null },
  { name: 'Esport', scoreFormat: 'GOALS', defaultSetsToWin: null },
  { name: 'Padel', scoreFormat: 'SETS', defaultSetsToWin: 2 },
];

// Order and labels match docs/product/roles-and-permissions.md exactly.
const PERMISSIONS = [
  { key: 'MANAGE_GENERAL', label: 'Gestion générale' },
  { key: 'MANAGE_PARTICIPANTS', label: 'Gérer les participants' },
  { key: 'MANAGE_LAYOUT', label: 'Gérer la mise en page' },
  { key: 'MANAGE_SCHEDULE', label: 'Gérer le calendrier' },
  { key: 'MANAGE_PRESENTATION', label: 'Gérer la présentation' },
  { key: 'MANAGE_PUBLIC_SITE', label: 'Gérer un site internet public' },
  { key: 'MANAGE_SLIDESHOW', label: 'Gérer le diaporama' },
  { key: 'MANAGE_DESIGN', label: 'Gérer la conception' },
  { key: 'MANAGE_SCORES', label: 'Gérer les scores' },
  { key: 'MANAGE_PHASES', label: "Gérer l'avancement des phases" },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    for (const { name, scoreFormat, defaultSetsToWin } of SPORTS) {
      await prisma.sport.upsert({
        where: { name },
        update: { scoreFormat, defaultSetsToWin },
        create: { name, scoreFormat, defaultSetsToWin },
      });
    }

    for (const [position, { key, label }] of PERMISSIONS.entries()) {
      await prisma.permission.upsert({
        where: { key },
        update: { label, position },
        create: { key, label, position },
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `Seeded ${SPORTS.length} sports and ${PERMISSIONS.length} permissions.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
