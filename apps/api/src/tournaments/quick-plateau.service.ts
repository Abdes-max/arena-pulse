import { BadRequestException, Injectable } from '@nestjs/common';
import { CompetitionPhaseType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { CategoriesService } from './categories.service';
import { CreateQuickPlateauDto } from './dto/create-quick-plateau.dto';
import { StructurePresetFormat } from './dto/create-structure-preset.dto';
import { FieldsService } from './fields.service';
import {
  KnockoutQualification,
  knockoutQualification,
} from './knockout-phase.util';
import { ScheduleGenerationService } from './schedule-generation.service';
import { StructurePresetsService } from './structure-presets.service';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';
import { VenuesService } from './venues.service';

/** Name given to every team created by the quick flow -- also how the review step spots names still to confirm. */
export const PLACEHOLDER_TEAM_NAME_PREFIX = 'Équipe ';

/**
 * Creates a ready-to-review plateau in one call by chaining the same
 * services the step-by-step admin pages use (so every validation they apply
 * still applies): tournament -> category -> venue + fields -> placeholder
 * teams -> structure preset -> pool calendar (-> final). If any step fails,
 * the half-built tournament is deleted so the organizer never ends up with
 * an orphan draft they didn't ask for.
 */
@Injectable()
export class QuickPlateauService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
    private readonly venuesService: VenuesService,
    private readonly fieldsService: FieldsService,
    private readonly teamsService: TeamsService,
    private readonly structurePresetsService: StructurePresetsService,
    private readonly scheduleGenerationService: ScheduleGenerationService,
    private readonly bracketsService: BracketsService,
  ) {}

  async create(organizationId: string, dto: CreateQuickPlateauDto) {
    const poolCount = dto.poolCount ?? 1;
    if (poolCount * 2 > dto.teamCount) {
      throw new BadRequestException('Il faut au moins 2 équipes par poule.');
    }
    // knockoutSize: classic single-elimination "phase finale" (2 = final,
    // 4 = semis, 8 = quarters...). withFinal is the older client's way of
    // asking for a plain final.
    const knockoutSize = dto.knockoutSize ?? (dto.withFinal ? 2 : null);
    const knockout = knockoutSize
      ? knockoutQualification(knockoutSize, dto.teamCount, poolCount)
      : null;
    if (knockoutSize && !knockout) {
      throw new BadRequestException(
        `Impossible de former une phase finale à ${knockoutSize} équipes avec ${dto.teamCount} équipes en ${poolCount} poule(s).`,
      );
    }

    const tournament = await this.tournamentsService.create(organizationId, {
      name: dto.name,
      sportId: dto.sportId,
      startDate: dto.date,
      endDate: dto.date,
    });
    try {
      await this.build(organizationId, tournament.id, dto, poolCount, knockout);
    } catch (error) {
      await this.prisma.tournament.delete({ where: { id: tournament.id } });
      throw error;
    }
    return this.tournamentsService.getDetail(organizationId, tournament.id);
  }

  private async build(
    organizationId: string,
    tournamentId: string,
    dto: CreateQuickPlateauDto,
    poolCount: number,
    knockout: KnockoutQualification | null,
  ) {
    const category = await this.categoriesService.create(
      organizationId,
      tournamentId,
      { name: dto.categoryName ?? 'Plateau' },
    );

    const venue = await this.venuesService.create(
      organizationId,
      tournamentId,
      {
        name: dto.venueName ?? 'Stade',
        ...(dto.venueAddress && { address: dto.venueAddress }),
      },
    );
    const fieldIds: string[] = [];
    for (let i = 0; i < dto.fieldCount; i++) {
      const field = await this.fieldsService.create(
        organizationId,
        tournamentId,
        venue.id,
        { name: `Terrain ${i + 1}`, position: i },
      );
      fieldIds.push(field.id);
    }

    for (let i = 0; i < dto.teamCount; i++) {
      await this.teamsService.create(organizationId, tournamentId, {
        name: `${PLACEHOLDER_TEAM_NAME_PREFIX}${i + 1}`,
        categoryId: category.id,
      });
    }

    await this.structurePresetsService.create(
      organizationId,
      tournamentId,
      category.id,
      {
        format: knockout
          ? StructurePresetFormat.POOLS_AND_KNOCKOUT
          : StructurePresetFormat.POOLS_ONLY,
        teamCount: dto.teamCount,
        poolCount,
        ...(knockout && {
          tiers: [
            {
              name: knockout.size === 2 ? 'Finale' : 'Phase finale',
              qualifiersPerPool: knockout.qualifiersPerPool,
              hasRankingMatch: !!dto.thirdPlaceMatch && knockout.size >= 4,
            },
          ],
          ...(knockout.bestOfPosition && {
            bestOfPosition: knockout.bestOfPosition,
          }),
        }),
        matchDurationMinutes: dto.matchDurationMinutes,
        breakDurationMinutes: dto.breakDurationMinutes,
      },
    );

    const poolPhase = await this.prisma.competitionPhase.findFirstOrThrow({
      where: {
        categoryId: category.id,
        type: CompetitionPhaseType.GROUP_STAGE,
      },
    });
    await this.scheduleGenerationService.generate(
      organizationId,
      tournamentId,
      poolPhase.id,
      { fieldIds, startDateTime: dto.startDateTime },
    );

    if (knockout) {
      await this.bracketsService.generateAllMatches(
        organizationId,
        tournamentId,
        category.id,
        {
          // After the pools (plus the pause the organizer asked for between
          // the two phases), round by round, on every field.
          fieldIds,
          breakAfterPoolsMinutes:
            dto.breakBetweenPhasesMinutes ?? dto.breakDurationMinutes,
          matchDurationMinutes: dto.matchDurationMinutes,
          breakDurationMinutes: dto.breakDurationMinutes,
        },
      );
    }
  }
}
