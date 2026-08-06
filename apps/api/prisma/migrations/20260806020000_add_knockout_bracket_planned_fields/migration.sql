-- AlterTable
ALTER TABLE "KnockoutBracket" ADD COLUMN     "plannedFieldIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "plannedStartDateTime" TIMESTAMP(3);
