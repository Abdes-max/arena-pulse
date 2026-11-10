-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: the demo and test organizations already in production (seed scripts, manual checks), recognised by name.
UPDATE "Organization" SET "isTest" = true WHERE "name" ~* '(démo|demo|test)';
