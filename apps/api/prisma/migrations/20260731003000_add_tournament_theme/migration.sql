-- CreateEnum
CREATE TYPE "PublicTheme" AS ENUM ('INK_SIGNAL', 'PULSE_EMBER', 'NEON_COURT');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "theme" "PublicTheme" NOT NULL DEFAULT 'INK_SIGNAL';
