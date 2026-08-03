-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "registrationFeeCents" INTEGER,
ADD COLUMN     "registrationFeeCurrency" TEXT DEFAULT 'eur';

-- CreateTable
CREATE TABLE "PlayerAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRefreshToken" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,

    CONSTRAINT "PlayerRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "managerEmail" TEXT NOT NULL,
    "managerPhone" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationPlayer" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "jerseyNumber" INTEGER,

    CONSTRAINT "RegistrationPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAccount_email_key" ON "PlayerAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRefreshToken_tokenHash_key" ON "PlayerRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PlayerRefreshToken_playerAccountId_idx" ON "PlayerRefreshToken"("playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_stripeCheckoutSessionId_key" ON "Registration"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_teamId_key" ON "Registration"("teamId");

-- CreateIndex
CREATE INDEX "Registration_tournamentId_idx" ON "Registration"("tournamentId");

-- CreateIndex
CREATE INDEX "Registration_categoryId_idx" ON "Registration"("categoryId");

-- CreateIndex
CREATE INDEX "Registration_playerAccountId_idx" ON "Registration"("playerAccountId");

-- CreateIndex
CREATE INDEX "RegistrationPlayer_registrationId_idx" ON "RegistrationPlayer"("registrationId");

-- AddForeignKey
ALTER TABLE "PlayerRefreshToken" ADD CONSTRAINT "PlayerRefreshToken_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationPlayer" ADD CONSTRAINT "RegistrationPlayer_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
