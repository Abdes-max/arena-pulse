-- AlterTable
ALTER TABLE "Team" ADD COLUMN "externalClubId" TEXT;

-- CreateTable
CREATE TABLE "FffClub" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FffClub_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "FffClub_name_idx" ON "FffClub"("name");
