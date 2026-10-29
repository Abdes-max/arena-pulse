import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { CategoriesService } from './categories.service';
import { CreateQuickPlateauDto } from './dto/create-quick-plateau.dto';
import { StructurePresetFormat } from './dto/create-structure-preset.dto';
import { FieldsService } from './fields.service';
import { QuickPlateauService } from './quick-plateau.service';
import { ScheduleGenerationService } from './schedule-generation.service';
import { StructurePresetsService } from './structure-presets.service';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';
import { VenuesService } from './venues.service';

describe('QuickPlateauService', () => {
  const baseDto: CreateQuickPlateauDto = {
    name: 'Plateau U11',
    sportId: 'sport-1',
    date: '2026-11-11',
    startDateTime: '2026-11-11T09:30:00.000Z',
    teamCount: 5,
    fieldCount: 2,
    matchDurationMinutes: 22,
    breakDurationMinutes: 8,
  };

  let prisma: {
    tournament: { delete: jest.Mock };
    competitionPhase: { findFirstOrThrow: jest.Mock };
  };
  let tournaments: { create: jest.Mock; getDetail: jest.Mock };
  let categories: { create: jest.Mock };
  let venues: { create: jest.Mock };
  let fields: { create: jest.Mock };
  let teams: { create: jest.Mock };
  let presets: { create: jest.Mock };
  let schedule: { generate: jest.Mock };
  let brackets: { generateAllMatches: jest.Mock };
  let service: QuickPlateauService;

  beforeEach(() => {
    let fieldCounter = 0;
    prisma = {
      tournament: { delete: jest.fn() },
      competitionPhase: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'phase-1' }),
      },
    };
    tournaments = {
      create: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
      getDetail: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
    };
    categories = { create: jest.fn().mockResolvedValue({ id: 'category-1' }) };
    venues = { create: jest.fn().mockResolvedValue({ id: 'venue-1' }) };
    fields = {
      create: jest
        .fn()
        .mockImplementation(() => ({ id: `field-${++fieldCounter}` })),
    };
    teams = { create: jest.fn() };
    presets = { create: jest.fn() };
    schedule = { generate: jest.fn() };
    brackets = { generateAllMatches: jest.fn() };
    service = new QuickPlateauService(
      prisma as unknown as PrismaService,
      tournaments as unknown as TournamentsService,
      categories as unknown as CategoriesService,
      venues as unknown as VenuesService,
      fields as unknown as FieldsService,
      teams as unknown as TeamsService,
      presets as unknown as StructurePresetsService,
      schedule as unknown as ScheduleGenerationService,
      brackets as unknown as BracketsService,
    );
  });

  it('builds teams, fields, a single pool and its calendar in one call', async () => {
    await service.create('org-1', baseDto);

    expect(tournaments.create).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        startDate: '2026-11-11',
        endDate: '2026-11-11',
      }),
    );
    expect(fields.create).toHaveBeenCalledTimes(2);
    expect(teams.create).toHaveBeenCalledTimes(5);
    expect(teams.create).toHaveBeenCalledWith('org-1', 'tournament-1', {
      name: 'Équipe 1',
      categoryId: 'category-1',
    });
    expect(presets.create).toHaveBeenCalledWith(
      'org-1',
      'tournament-1',
      'category-1',
      expect.objectContaining({
        format: StructurePresetFormat.POOLS_ONLY,
        teamCount: 5,
        poolCount: 1,
      }),
    );
    expect(schedule.generate).toHaveBeenCalledWith(
      'org-1',
      'tournament-1',
      'phase-1',
      {
        fieldIds: ['field-1', 'field-2'],
        startDateTime: baseDto.startDateTime,
      },
    );
    expect(brackets.generateAllMatches).not.toHaveBeenCalled();
  });

  it('adds a 1st-vs-2nd final when asked', async () => {
    await service.create('org-1', { ...baseDto, withFinal: true });

    expect(presets.create).toHaveBeenCalledWith(
      'org-1',
      'tournament-1',
      'category-1',
      expect.objectContaining({
        format: StructurePresetFormat.POOLS_AND_KNOCKOUT,
        tiers: [
          { name: 'Finale', qualifiersPerPool: 2, hasRankingMatch: false },
        ],
      }),
    );
    expect(brackets.generateAllMatches).toHaveBeenCalledWith(
      'org-1',
      'tournament-1',
      'category-1',
      expect.objectContaining({ fieldIds: ['field-1', 'field-2'] }),
    );
  });

  it('builds a classic knockout phase (semi-finals + 3rd place) from 2 pools', async () => {
    await service.create('org-1', {
      ...baseDto,
      teamCount: 8,
      poolCount: 2,
      knockoutSize: 4,
      thirdPlaceMatch: true,
    });

    expect(presets.create).toHaveBeenCalledWith(
      'org-1',
      'tournament-1',
      'category-1',
      expect.objectContaining({
        format: StructurePresetFormat.POOLS_AND_KNOCKOUT,
        tiers: [
          { name: 'Phase finale', qualifiersPerPool: 2, hasRankingMatch: true },
        ],
      }),
    );
    expect(brackets.generateAllMatches).toHaveBeenCalled();
  });

  it('fills an uneven bracket with the best runners-up', async () => {
    await service.create('org-1', {
      ...baseDto,
      teamCount: 9,
      poolCount: 3,
      knockoutSize: 4,
    });

    expect(presets.create).toHaveBeenCalledWith(
      'org-1',
      'tournament-1',
      'category-1',
      expect.objectContaining({
        bestOfPosition: { position: 2, bestCount: 1 },
      }),
    );
  });

  it('rejects a knockout phase the pools cannot feed', async () => {
    await expect(
      service.create('org-1', { ...baseDto, teamCount: 5, knockoutSize: 8 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tournaments.create).not.toHaveBeenCalled();
  });

  it('rejects pools of fewer than 2 teams before creating anything', async () => {
    await expect(
      service.create('org-1', { ...baseDto, teamCount: 3, poolCount: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tournaments.create).not.toHaveBeenCalled();
  });

  it('deletes the half-built tournament when a later step fails', async () => {
    schedule.generate.mockRejectedValue(new Error('boom'));

    await expect(service.create('org-1', baseDto)).rejects.toThrow('boom');
    expect(prisma.tournament.delete).toHaveBeenCalledWith({
      where: { id: 'tournament-1' },
    });
  });
});
