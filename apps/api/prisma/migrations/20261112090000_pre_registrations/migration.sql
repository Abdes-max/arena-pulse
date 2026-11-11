-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('TEAM', 'INDIVIDUAL');
CREATE TYPE "RegistrationPaymentStatus" AS ENUM ('UNPAID', 'PAID', 'EXEMPT');

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'PENDING';
ALTER TYPE "RegistrationStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "RegistrationStatus" ADD VALUE 'WAITLIST';
ALTER TYPE "RegistrationStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Sport" ADD COLUMN "participantType" "ParticipantType" NOT NULL DEFAULT 'TEAM';
ALTER TABLE "Tournament" ADD COLUMN "registrationsOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "registrationOpensAt" TIMESTAMP(3),
ADD COLUMN "registrationClosesAt" TIMESTAMP(3),
ADD COLUMN "registrationPaymentInfo" TEXT;
ALTER TABLE "Category" ADD COLUMN "maxTeams" INTEGER;
ALTER TABLE "Registration" ADD COLUMN "paymentStatus" "RegistrationPaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "rejectionReason" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3);

-- Registrations made with the former online payment were paid.
UPDATE "Registration" SET "paymentStatus" = 'PAID' WHERE "status" = 'PAID' AND "amountCents" > 0;
UPDATE "Registration" SET "paymentStatus" = 'EXEMPT' WHERE "status" = 'PAID' AND "amountCents" = 0;

-- Individual sports
UPDATE "Sport" SET "participantType" = 'INDIVIDUAL' WHERE "name" IN ('Tennis', 'Badminton');
