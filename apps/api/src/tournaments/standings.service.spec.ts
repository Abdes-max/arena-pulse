import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  team: { findMany: jest.Mock };
  match: { findMany: jest.Mock };
  standingRule: { findUnique: jest.Mock };
  qualificationRule: { findMany: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    team: { findMany: jest.fn().mockResolvedValue([]) },
    match: { findMany: jest.fn().mockResolvedValue([]) },
    standingRule: { findUnique: jest.fn().mockResolvedValue(null) },
    qualificationRule: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('StandingsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: { assertTournamentExists: jest.Mock };
  let groupsService: { assertGroupExists: jest.Mock };
  let service: StandingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentExists: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
    };
    groupsService = {
      assertGroupExists: jest.fn().mockResolvedValue({ id: 'group-1' }),
    };
    service = new StandingsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      groupsService as unknown as GroupsService,
    );
  });

  describe('getStandings', () => {
    it('ignores matches with no score or an unvalidated score', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ]);
      prisma.match.findMany.mockResolvedValue([
        { homeTeamId: 'a', awayTeamId: 'b', score: null },
        {
          homeTeamId: 'a',
          awayTeamId: 'b',
          score: { homeScore: 3, awayScore: 0, isValidated: false },
        },
      ]);

      const result = await service.getStandings(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(result.rows).toEqual([
        expect.objectContaining({ teamId: 'a', played: 0, points: 0 }),
        expect.objectContaining({ teamId: 'b', played: 0, points: 0 }),
      ]);
      expect(result.isComplete).toBe(false);
    });

    it('counts only validated scores and reports completion', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ]);
      prisma.match.findMany.mockResolvedValue([
        {
          homeTeamId: 'a',
          awayTeamId: 'b',
          score: { homeScore: 2, awayScore: 0, isValidated: true },
        },
      ]);
      prisma.standingRule.findUnique.mockResolvedValue({
        winPoints: 3,
        drawPoints: 1,
        lossPoints: 0,
        tieBreakOrder: [
          'POINTS',
          'GOAL_DIFFERENCE',
          'GOALS_SCORED',
          'HEAD_TO_HEAD',
        ],
      });

      const result = await service.getStandings(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(result.rows[0]).toMatchObject({
        teamId: 'a',
        points: 3,
        position: 1,
      });
      expect(result.rows[1]).toMatchObject({
        teamId: 'b',
        points: 0,
        position: 2,
      });
      expect(result.isComplete).toBe(true);
    });

    it('reports incomplete when there are no matches at all', async () => {
      prisma.team.findMany.mockResolvedValue([{ id: 'a', name: 'Alpha' }]);
      prisma.match.findMany.mockResolvedValue([]);

      const result = await service.getStandings(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(result.isComplete).toBe(false);
    });
  });

  describe('getQualifications', () => {
    it('maps each rule to the teams currently occupying its position range', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'c', name: 'Gamma' },
      ]);
      prisma.match.findMany.mockResolvedValue([
        {
          homeTeamId: 'a',
          awayTeamId: 'b',
          score: { homeScore: 3, awayScore: 0, isValidated: true },
        },
        {
          homeTeamId: 'b',
          awayTeamId: 'c',
          score: { homeScore: 2, awayScore: 0, isValidated: true },
        },
      ]);
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          fromPosition: 1,
          toPosition: 2,
          targetPhaseId: 'phase-2',
          targetPhase: { name: 'Champions League' },
        },
      ]);

      const result = await service.getQualifications(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(result).toEqual([
        {
          ruleId: 'rule-1',
          fromPosition: 1,
          toPosition: 2,
          targetPhaseId: 'phase-2',
          targetPhaseName: 'Champions League',
          qualifiedTeams: [
            { id: 'a', name: 'Alpha', position: 1 },
            { id: 'b', name: 'Beta', position: 2 },
          ],
        },
      ]);
    });
  });
});
