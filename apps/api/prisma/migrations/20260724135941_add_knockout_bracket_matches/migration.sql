-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "isThirdPlaceMatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "knockoutBracketId" TEXT,
ALTER COLUMN "groupId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Match_knockoutBracketId_idx" ON "Match"("knockoutBracketId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_knockoutBracketId_fkey" FOREIGN KEY ("knockoutBracketId") REFERENCES "KnockoutBracket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
