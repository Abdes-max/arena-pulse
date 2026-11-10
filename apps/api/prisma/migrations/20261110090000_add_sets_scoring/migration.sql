-- CreateEnum
CREATE TYPE "ScoreFormat" AS ENUM ('GOALS', 'SETS');

-- AlterTable
ALTER TABLE "Sport" ADD COLUMN "scoreFormat" "ScoreFormat" NOT NULL DEFAULT 'GOALS',
ADD COLUMN "defaultSetsToWin" INTEGER;

-- AlterTable
ALTER TABLE "CompetitionPhase" ADD COLUMN "setsToWin" INTEGER;

-- AlterTable
ALTER TABLE "MatchScore" ADD COLUMN "sets" JSONB;

-- AlterTable
ALTER TABLE "StandingRule" ADD COLUMN "decidingSetWinPoints" INTEGER,
ADD COLUMN "decidingSetLossPoints" INTEGER;
