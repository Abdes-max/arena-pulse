-- CreateEnum
CREATE TYPE "AdminUiMode" AS ENUM ('SIMPLE', 'FULL');

-- Existing accounts keep everything they already see (FULL); only accounts
-- created from now on start in the simple mode.
ALTER TABLE "User" ADD COLUMN "adminUiMode" "AdminUiMode" NOT NULL DEFAULT 'FULL';
ALTER TABLE "User" ALTER COLUMN "adminUiMode" SET DEFAULT 'SIMPLE';
