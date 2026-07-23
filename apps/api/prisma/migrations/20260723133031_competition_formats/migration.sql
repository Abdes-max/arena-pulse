-- CreateEnum
CREATE TYPE "CompetitionPhaseType" AS ENUM ('GROUP_STAGE', 'KNOCKOUT');

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "CompetitionPhase" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CompetitionPhaseType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "winPoints" INTEGER NOT NULL DEFAULT 3,
    "drawPoints" INTEGER NOT NULL DEFAULT 1,
    "lossPoints" INTEGER NOT NULL DEFAULT 0,
    "tieBreakOrder" TEXT[],
    "supplementaryStandingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "penaltyShootoutEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnockoutBracket" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "hasRankingMatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnockoutBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromPosition" INTEGER NOT NULL,
    "toPosition" INTEGER NOT NULL,
    "targetPhaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionPhase_categoryId_name_key" ON "CompetitionPhase"("categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Group_phaseId_name_key" ON "Group"("phaseId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StandingRule_groupId_key" ON "StandingRule"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "KnockoutBracket_phaseId_key" ON "KnockoutBracket"("phaseId");

-- CreateIndex
CREATE INDEX "QualificationRule_groupId_idx" ON "QualificationRule"("groupId");

-- CreateIndex
CREATE INDEX "QualificationRule_targetPhaseId_idx" ON "QualificationRule"("targetPhaseId");

-- CreateIndex
CREATE INDEX "Team_groupId_idx" ON "Team"("groupId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionPhase" ADD CONSTRAINT "CompetitionPhase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "CompetitionPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingRule" ADD CONSTRAINT "StandingRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnockoutBracket" ADD CONSTRAINT "KnockoutBracket_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "CompetitionPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRule" ADD CONSTRAINT "QualificationRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationRule" ADD CONSTRAINT "QualificationRule_targetPhaseId_fkey" FOREIGN KEY ("targetPhaseId") REFERENCES "CompetitionPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
