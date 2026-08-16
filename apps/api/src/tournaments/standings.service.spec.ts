import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from './ratings.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  team: { findMany: jest.Mock };
  match: { findMany: jest.Mock };
  standingRule: { findUnique: jest.Mock; update: jest.Mock };
  qualificationRule: { findMany: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    team: { findMany: jest.fn().mockResolvedValue([]) },
    match: { findMany: jest.fn().mockResolvedValue([]) },
    standingRule: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    qualificationRule: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('StandingsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentExists: jest.Mock;
    assertTournamentIsEditable: jest.Mock;
  };
  let groupsService: { assertGroupExists: jest.Mock };
  let ratingsService: { getRatingsForTeamNames: jest.Mock };
  let service: StandingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentExists: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
    };
    groupsService = {
      assertGroupExists: jest
        .fn()
        .mockResolvedValue({ id: 'group-1', phase: { isSeedPhase: false } }),
    };
    ratingsService = {
      getRatingsForTeamNames: jest.fn().mockResolvedValue(new Map()),
    };
    service = new StandingsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      groupsService as unknown as GroupsService,
      ratingsService as unknown as RatingsService,
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

    it("attaches each team's rating by name, marking a high-deviation team as provisional", async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ]);
      prisma.match.findMany.mockResolvedValue([]);
      ratingsService.getRatingsForTeamNames.mockResolvedValue(
        new Map([
          ['Alpha', { rating: 1620, ratingDeviation: 80, matchesPlayed: 12 }],
          ['Beta', { rating: 1500, ratingDeviation: 350, matchesPlayed: 0 }],
        ]),
      );

      const result = await service.getStandings(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(ratingsService.getRatingsForTeamNames).toHaveBeenCalledWith(
        'org-1',
        ['Alpha', 'Beta'],
      );
      expect(result.rows).toEqual([
        expect.objectContaining({
          teamId: 'a',
          rating: 1620,
          ratingDeviation: 80,
          isProvisional: false,
        }),
        expect.objectContaining({
          teamId: 'b',
          rating: 1500,
          ratingDeviation: 350,
          isProvisional: true,
        }),
      ]);
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

    it('flags two teams left totally tied (no matches, no manual pick) as an unresolved tie', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 'z', name: 'Zeta' },
        { id: 'a', name: 'Alpha' },
      ]);

      const result = await service.getStandings(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(result.unresolvedTies).toEqual([
        {
          teams: [
            { id: 'a', name: 'Alpha' },
            { id: 'z', name: 'Zeta' },
          ],
        },
      ]);
    });

    it('clears the unresolved tie once an organizer pick is stored', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 'z', name: 'Zeta' },
        { id: 'a', name: 'Alpha' },
      ]);
      prisma.standingRule.findUnique.mockResolvedValue({
        winPoints: 3,
        drawPoints: 1,
        lossPoints: 0,
        tieBreakOrder: ['POINTS', 'GOAL_DIFFERENCE', 'GOALS_SCORED'],
        manualTieBreakOrder: ['z'],
      });

      const result = await service.getStandings(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(result.unresolvedTies).toEqual([]);
      expect(result.rows.map((row) => row.teamId)).toEqual(['z', 'a']);
    });

    it('is complete with no unresolved ties for a KNOCKOUT_ONLY seed group, even with zero matches and every team tied', async () => {
      // A seed group (see CompetitionPhase.isSeedPhase) never has a match
      // generated in it, by design -- unlike a real, not-yet-played pool
      // (the "reports incomplete when there are no matches at all" and
      // "flags two teams left totally tied" cases above), it must resolve
      // immediately, using the deterministic alphabetical fallback as the
      // real seeding, not report a fairness question nobody can answer.
      groupsService.assertGroupExists.mockResolvedValue({
        id: 'group-1',
        phase: { isSeedPhase: true },
      });
      prisma.team.findMany.mockResolvedValue([
        { id: 'z', name: 'Zeta' },
        { id: 'a', name: 'Alpha' },
      ]);

      const result = await service.getStandings(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(result.isComplete).toBe(true);
      expect(result.unresolvedTies).toEqual([]);
      expect(result.rows.map((row) => row.teamId)).toEqual(['a', 'z']);
    });
  });

  describe('setManualTieBreakChoice', () => {
    it('appends the picked team to the stored manual order', async () => {
      prisma.standingRule.findUnique.mockResolvedValue({
        manualTieBreakOrder: ['z'],
      });

      await service.setManualTieBreakChoice(
        'org-1',
        'tournament-1',
        'group-1',
        'a',
      );

      expect(
        tournamentsService.assertTournamentIsEditable,
      ).toHaveBeenCalledWith('org-1', 'tournament-1');
      expect(prisma.standingRule.update).toHaveBeenCalledWith({
        where: { groupId: 'group-1' },
        data: { manualTieBreakOrder: ['z', 'a'] },
      });
    });

    it('does not duplicate a team already picked', async () => {
      prisma.standingRule.findUnique.mockResolvedValue({
        manualTieBreakOrder: ['a'],
      });

      await service.setManualTieBreakChoice(
        'org-1',
        'tournament-1',
        'group-1',
        'a',
      );

      expect(prisma.standingRule.update).not.toHaveBeenCalled();
    });
  });

  describe('clearManualTieBreakOrder', () => {
    it('resets the stored manual order back to empty', async () => {
      await service.clearManualTieBreakOrder(
        'org-1',
        'tournament-1',
        'group-1',
      );

      expect(prisma.standingRule.update).toHaveBeenCalledWith({
        where: { groupId: 'group-1' },
        data: { manualTieBreakOrder: [] },
      });
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
