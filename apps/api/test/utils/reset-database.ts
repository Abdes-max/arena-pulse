import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Deletes all rows in FK-safe order — called between e2e tests to isolate
 * them. Does NOT touch Sport/Permission: they're global seeded reference
 * data shared across every test file, not per-test state.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.tournamentAdministratorPermission.deleteMany();
  await prisma.tournamentAdministrator.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}
