import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const SPORTS = ['Football', 'Basketball', 'Volleyball', 'Handball', 'Rugby', 'Tennis', 'Badminton', 'Futsal'];

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
    for (const name of SPORTS) {
      await prisma.sport.upsert({ where: { name }, update: {}, create: { name } });
    }

    for (const [position, { key, label }] of PERMISSIONS.entries()) {
      await prisma.permission.upsert({
        where: { key },
        update: { label, position },
        create: { key, label, position },
      });
    }

    // eslint-disable-next-line no-console
    console.log(`Seeded ${SPORTS.length} sports and ${PERMISSIONS.length} permissions.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
