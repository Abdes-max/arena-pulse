-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "slug" TEXT;

-- Backfill existing rows with a deterministic, unique placeholder slug so the
-- column can be made NOT NULL + UNIQUE below. Real tournaments created after
-- this migration always get a name-derived slug from TournamentsService.
UPDATE "Tournament" SET "slug" = 'tournament-' || substr(id, 1, 8) WHERE "slug" IS NULL;

-- AlterTable
ALTER TABLE "Tournament" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");
