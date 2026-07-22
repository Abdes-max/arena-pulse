import { PrismaService } from '../../src/prisma/prisma.service';

/** Deletes all rows in FK-safe order — called between e2e tests to isolate them. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.refreshToken.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}
