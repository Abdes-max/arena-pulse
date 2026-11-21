-- One account for team managers and organizers: pre-registrations move
-- from PlayerAccount to User. A team manager without an organizer account
-- gets a User with the same email, name and password (already verified: the
-- account was in use), and no organization.

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "userId" TEXT;

-- Users for the team managers who had no organizer account yet.
INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "emailVerifiedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."email", p."passwordHash", p."firstName", p."lastName", NOW(), p."createdAt", NOW()
FROM "PlayerAccount" p
WHERE NOT EXISTS (SELECT 1 FROM "User" u WHERE lower(u."email") = lower(p."email"));

-- Each request now belongs to the User with the manager's email.
UPDATE "Registration" r
SET "userId" = u."id"
FROM "PlayerAccount" p
JOIN "User" u ON lower(u."email") = lower(p."email")
WHERE r."playerAccountId" = p."id";

ALTER TABLE "Registration" ALTER COLUMN "userId" SET NOT NULL;

-- DropForeignKey / DropIndex / DropColumn
ALTER TABLE "Registration" DROP CONSTRAINT "Registration_playerAccountId_fkey";
DROP INDEX "Registration_playerAccountId_idx";
ALTER TABLE "Registration" DROP COLUMN "playerAccountId";

-- CreateIndex
CREATE INDEX "Registration_userId_idx" ON "Registration"("userId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
