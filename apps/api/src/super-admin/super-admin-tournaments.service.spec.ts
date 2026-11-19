import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminTournamentsService } from './super-admin-tournaments.service';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';

// Only covers deleteTournament/deleteTeam/deletePlayer (feat/173) --
// list/getDetail have no unit spec of their own yet. Every fixture uses
// logoUrl: null so deleteLogoFile's early-return path is exercised without
// touching the real filesystem.
type PrismaMock = {
  tournament: { findUnique: jest.Mock; delete: jest.Mock };
  organizationMember: { findFirst: jest.Mock };
  team: { findMany: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
  tournamentSponsor: { findMany: jest.Mock };
  player: { findUnique: jest.Mock; delete: jest.Mock };
  registration: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  return {
    tournament: { findUnique: jest.fn(), delete: jest.fn() },
    organizationMember: { findFirst: jest.fn() },
    team: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    tournamentSponsor: { findMany: jest.fn().mockResolvedValue([]) },
    player: { findUnique: jest.fn(), delete: jest.fn() },
    registration: { updateMany: jest.fn() },
    // Batch form: the operations are already-started mock calls.
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

import { TokenService } from '../auth/token.service';

describe('SuperAdminTournamentsService deletions', () => {
  let prisma: PrismaMock;
  let auditLog: { record: jest.Mock };
  let service: SuperAdminTournamentsService;
  let tokenService: { signSupportAccessToken: jest.Mock };

  beforeEach(() => {
    prisma = createPrismaMock();
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    tokenService = {
      signSupportAccessToken: jest.fn().mockReturnValue('support-token'),
    };
    service = new SuperAdminTournamentsService(
      prisma as unknown as PrismaService,
      new ConfigService({}),
      auditLog as unknown as SuperAdminAuditLogService,
      tokenService as unknown as TokenService,
    );
  });

  describe('deleteTournament', () => {
    it('rejects an invalid confirmation without deleting anything', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 'tournament-1',
        name: 'Coupe du Monde',
        logoUrl: null,
      });

      await expect(
        service.deleteTournament('tournament-1', 'super-admin-1', {
          confirmation: 'nope',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tournament.delete).not.toHaveBeenCalled();
    });

    it('deletes the tournament and audit-logs it when confirmed', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 'tournament-1',
        name: 'Coupe du Monde',
        logoUrl: null,
      });
      prisma.tournament.delete.mockResolvedValue({ id: 'tournament-1' });

      await service.deleteTournament('tournament-1', 'super-admin-1', {
        confirmation: 'SUPPRIMER',
      });

      expect(prisma.tournament.delete).toHaveBeenCalledWith({
        where: { id: 'tournament-1' },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE_TOURNAMENT',
          targetType: 'Tournament',
          targetId: 'tournament-1',
        }),
      );
    });
  });

  describe('deleteTeam', () => {
    it('rejects when the team belongs to a different tournament', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        tournamentId: 'other-tournament',
        name: 'Les Copains',
        logoUrl: null,
      });

      await expect(
        service.deleteTeam('tournament-1', 'team-1', 'super-admin-1', {
          confirmation: 'SUPPRIMER',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.team.delete).not.toHaveBeenCalled();
    });

    it('deletes the team and audit-logs it when confirmed', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        tournamentId: 'tournament-1',
        name: 'Les Copains',
        logoUrl: null,
      });
      prisma.team.delete.mockResolvedValue({ id: 'team-1' });

      await service.deleteTeam('tournament-1', 'team-1', 'super-admin-1', {
        confirmation: 'SUPPRIMER',
      });

      expect(prisma.team.delete).toHaveBeenCalledWith({
        where: { id: 'team-1' },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE_TEAM',
          targetType: 'Team',
          targetId: 'team-1',
        }),
      );
    });
  });

  describe('deletePlayer', () => {
    it('rejects when the player belongs to a different team', async () => {
      prisma.player.findUnique.mockResolvedValue({
        id: 'player-1',
        teamId: 'other-team',
        firstName: 'Ada',
        lastName: 'Lovelace',
        team: { tournamentId: 'tournament-1' },
      });

      await expect(
        service.deletePlayer(
          'tournament-1',
          'team-1',
          'player-1',
          'super-admin-1',
          { confirmation: 'SUPPRIMER' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.player.delete).not.toHaveBeenCalled();
    });

    it('deletes the player and audit-logs it when confirmed', async () => {
      prisma.player.findUnique.mockResolvedValue({
        id: 'player-1',
        teamId: 'team-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        team: { tournamentId: 'tournament-1' },
      });
      prisma.player.delete.mockResolvedValue({ id: 'player-1' });

      await service.deletePlayer(
        'tournament-1',
        'team-1',
        'player-1',
        'super-admin-1',
        { confirmation: 'SUPPRIMER' },
      );

      expect(prisma.player.delete).toHaveBeenCalledWith({
        where: { id: 'player-1' },
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE_PLAYER',
          targetType: 'Player',
          targetId: 'player-1',
          note: 'Ada Lovelace',
        }),
      );
    });
  });

  describe('startSupportSession', () => {
    it("opens a 2 h session as the organization's first admin and logs it", async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        id: 't-1',
        name: 'Plateau U11',
        organizationId: 'org-1',
      });
      prisma.organizationMember.findFirst.mockResolvedValue({
        user: {
          id: 'u-1',
          email: 'orga@club.fr',
          firstName: 'Ana',
          lastName: 'B',
        },
      });

      const result = await service.startSupportSession('sa-1', 't-1');

      expect(tokenService.signSupportAccessToken).toHaveBeenCalledWith({
        sub: 'u-1',
        email: 'orga@club.fr',
        type: 'organizer',
        supportBy: 'sa-1',
      });
      expect(result).toEqual(
        expect.objectContaining({
          accessToken: 'support-token',
          organizationId: 'org-1',
        }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUPPORT_SESSION', targetId: 't-1' }),
      );
    });

    it('refuses an unknown tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue(null);
      await expect(service.startSupportSession('sa-1', 'nope')).rejects.toThrow(
        'introuvable',
      );
    });
  });
});
