-- AlterTable
ALTER TABLE "TournamentPublicationOrder" ADD COLUMN     "revenueCatTransactionId" TEXT;

-- AlterTable
ALTER TABLE "OrganizationSubscription" ADD COLUMN     "revenueCatTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPublicationOrder_revenueCatTransactionId_key" ON "TournamentPublicationOrder"("revenueCatTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSubscription_revenueCatTransactionId_key" ON "OrganizationSubscription"("revenueCatTransactionId");
