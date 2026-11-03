-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "launchPromoRedeemedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TournamentPublicationOrder" ADD COLUMN     "launchPromo" BOOLEAN NOT NULL DEFAULT false;
