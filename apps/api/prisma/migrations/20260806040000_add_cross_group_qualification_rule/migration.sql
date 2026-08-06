-- CreateTable
CREATE TABLE "CrossGroupQualificationRule" (
    "id" TEXT NOT NULL,
    "phaseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "bestCount" INTEGER NOT NULL,
    "targetPhaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrossGroupQualificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrossGroupQualificationRule_phaseId_idx" ON "CrossGroupQualificationRule"("phaseId");

-- CreateIndex
CREATE INDEX "CrossGroupQualificationRule_targetPhaseId_idx" ON "CrossGroupQualificationRule"("targetPhaseId");

-- AddForeignKey
ALTER TABLE "CrossGroupQualificationRule" ADD CONSTRAINT "CrossGroupQualificationRule_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "CompetitionPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossGroupQualificationRule" ADD CONSTRAINT "CrossGroupQualificationRule_targetPhaseId_fkey" FOREIGN KEY ("targetPhaseId") REFERENCES "CompetitionPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
