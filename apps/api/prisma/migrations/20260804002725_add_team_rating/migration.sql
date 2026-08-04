-- CreateTable
CREATE TABLE "TeamRating" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamRating_organizationId_idx" ON "TeamRating"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRating_organizationId_teamName_key" ON "TeamRating"("organizationId", "teamName");

-- AddForeignKey
ALTER TABLE "TeamRating" ADD CONSTRAINT "TeamRating_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
