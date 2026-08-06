ALTER TABLE "StandingRule" ADD COLUMN "manualTieBreakOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CrossGroupQualificationRule" ADD COLUMN "manualTieBreakOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
