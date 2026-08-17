-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "description" TEXT,
ADD COLUMN     "practicalInfo" TEXT,
ADD COLUMN     "rules" TEXT;

-- CreateTable
CREATE TABLE "TournamentSponsor" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "linkUrl" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentSponsor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentSponsor_tournamentId_idx" ON "TournamentSponsor"("tournamentId");

-- AddForeignKey
ALTER TABLE "TournamentSponsor" ADD CONSTRAINT "TournamentSponsor_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
