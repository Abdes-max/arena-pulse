-- CreateEnum
CREATE TYPE "TournamentPublicationOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID');

-- CreateTable
CREATE TABLE "TournamentPublicationOrder" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "status" "TournamentPublicationOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "categoriesCount" INTEGER NOT NULL,
    "teamsCount" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "TournamentPublicationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPublicationOrder_stripeCheckoutSessionId_key" ON "TournamentPublicationOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "TournamentPublicationOrder_tournamentId_idx" ON "TournamentPublicationOrder"("tournamentId");

-- AddForeignKey
ALTER TABLE "TournamentPublicationOrder" ADD CONSTRAINT "TournamentPublicationOrder_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
