-- AlterTable
ALTER TABLE "CompetitionPhase" ADD COLUMN "scoresValidatedAt" TIMESTAMP(3);

-- Existing tournaments: a pool phase that feeds a knockout phase and whose
-- matches are all finished was already drawn automatically, so treat it as
-- validated (the organizer can reopen it to fix a score).
UPDATE "CompetitionPhase" AS p
SET "scoresValidatedAt" = NOW()
WHERE p."type" = 'GROUP_STAGE'
  AND p."isSeedPhase" = false
  AND (
    EXISTS (
      SELECT 1 FROM "QualificationRule" r
      JOIN "Group" g ON g."id" = r."groupId"
      WHERE g."phaseId" = p."id"
    )
    OR EXISTS (
      SELECT 1 FROM "CrossGroupQualificationRule" c WHERE c."phaseId" = p."id"
    )
  )
  AND EXISTS (
    SELECT 1 FROM "Match" m
    JOIN "Group" g ON g."id" = m."groupId"
    WHERE g."phaseId" = p."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "Match" m
    JOIN "Group" g ON g."id" = m."groupId"
    WHERE g."phaseId" = p."id" AND m."status" NOT IN ('COMPLETED', 'FORFEITED', 'CANCELLED')
  );
