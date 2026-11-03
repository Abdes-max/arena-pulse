import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Deletes all rows in FK-safe order — called between e2e tests to isolate
 * them. Does NOT touch Sport/Permission: they're global seeded reference
 * data shared across every test file, not per-test state.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.tournamentAdministratorPermission.deleteMany();
  await prisma.tournamentAdministrator.deleteMany();
  await prisma.matchOfficial.deleteMany();
  await prisma.match.deleteMany();
  await prisma.player.deleteMany();
  await prisma.registrationPlayer.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.qualificationRule.deleteMany();
  await prisma.standingRule.deleteMany();
  await prisma.knockoutBracket.deleteMany();
  await prisma.team.deleteMany();
  await prisma.group.deleteMany();
  await prisma.competitionPhase.deleteMany();
  await prisma.division.deleteMany();
  await prisma.category.deleteMany();
  await prisma.timeSlot.deleteMany();
  await prisma.field.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.referee.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.teamRating.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.playerRefreshToken.deleteMany();
  await prisma.playerAccount.deleteMany();
  await prisma.superAdminAuditLog.deleteMany();
  await prisma.superAdminRefreshToken.deleteMany();
  await prisma.superAdminAccount.deleteMany();
}
