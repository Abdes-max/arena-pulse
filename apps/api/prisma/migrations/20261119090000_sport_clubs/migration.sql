-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "organizerClubId" TEXT;

-- CreateTable
CREATE TABLE "SportClub" (
    "sport" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "logoSource" TEXT,
    "dissolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportClub_pkey" PRIMARY KEY ("sport","slug")
);

-- CreateIndex
CREATE INDEX "SportClub_sport_name_idx" ON "SportClub"("sport", "name");
