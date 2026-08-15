// Creates a SuperAdminAccount row directly via Prisma. This is deliberately
// the ONLY way to create one -- there is no HTTP registration endpoint for
// this model anywhere in the API (see SuperAdminAccount's schema.prisma
// comment). Run by hand, locally or over SSH on the VPS, never from CI.
//
// Usage (from apps/api): npm run build && node dist/prisma/create-super-admin.js \
//   --email=you@example.com --password=... --firstName=Ada --lastName=Lovelace
// Env: DATABASE_URL (same as the rest of the app)

import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(raw);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

async function main() {
  const { email, password, firstName, lastName } = parseArgs();
  if (!email || !password || !firstName || !lastName) {
    console.error(
      'Usage: node dist/prisma/create-super-admin.js --email=... --password=... --firstName=... --lastName=...',
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 12) {
    // Deliberately stricter than the 8-char minimum on organizer/player
    // accounts (RegisterDto) -- this account can see and act on every
    // organization on the platform.
    console.error('Le mot de passe doit contenir au moins 12 caractères.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const existing = await prisma.superAdminAccount.findUnique({ where: { email } });
    if (existing) {
      console.error(`Un compte super admin existe déjà pour ${email}.`);
      process.exitCode = 1;
      return;
    }

    // Same hashing scheme as PasswordService (apps/api/src/auth/password.service.ts)
    // -- kept independent rather than importing that class directly, since
    // pulling in the full Nest DI graph for a one-off script is unnecessary.
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    const account = await prisma.superAdminAccount.create({
      data: { email, passwordHash, firstName, lastName },
    });
    console.log(`Compte super admin créé : ${account.email} (${account.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
