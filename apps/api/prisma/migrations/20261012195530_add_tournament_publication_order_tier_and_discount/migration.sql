-- AlterTable
ALTER TABLE "TournamentPublicationOrder" ADD COLUMN     "discountAmountCents" INTEGER,
ADD COLUMN     "discountPercent" INTEGER,
ADD COLUMN     "tierCents" INTEGER;

-- Backfill: safe because no order has ever been discounted before promo
-- codes were enabled on tournament publication (PR #231) -- amountCents is
-- still an exact stand-in for the pre-discount tier price on every existing
-- row.
UPDATE "TournamentPublicationOrder" SET "tierCents" = "amountCents";

-- AlterTable
ALTER TABLE "TournamentPublicationOrder" ALTER COLUMN "tierCents" SET NOT NULL;
