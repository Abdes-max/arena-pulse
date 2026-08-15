-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SuperAdminAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdminRefreshToken" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenId" TEXT,

    CONSTRAINT "SuperAdminRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuperAdminAuditLog" (
    "id" TEXT NOT NULL,
    "superAdminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdminAccount_email_key" ON "SuperAdminAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdminRefreshToken_tokenHash_key" ON "SuperAdminRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SuperAdminRefreshToken_superAdminId_idx" ON "SuperAdminRefreshToken"("superAdminId");

-- CreateIndex
CREATE INDEX "SuperAdminRefreshToken_familyId_idx" ON "SuperAdminRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_superAdminId_idx" ON "SuperAdminAuditLog"("superAdminId");

-- CreateIndex
CREATE INDEX "SuperAdminAuditLog_targetType_targetId_idx" ON "SuperAdminAuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "SuperAdminRefreshToken" ADD CONSTRAINT "SuperAdminRefreshToken_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "SuperAdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuperAdminAuditLog" ADD CONSTRAINT "SuperAdminAuditLog_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES "SuperAdminAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

