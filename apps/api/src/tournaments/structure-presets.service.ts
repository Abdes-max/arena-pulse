import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CompetitionPhaseType, Group } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPowerOfTwo } from './bracket-seeding.util';
import { CategoriesService } from './categories.service';
import { CreateStructurePresetDto } from './dto/create-structure-preset.dto';
import { DEFAULT_TIE_BREAK_ORDER } from './standing-rule.constants';
import { ScheduleGenerationService } from './schedule-generation.service';
import { TournamentsService } from './tournaments.service';

const MAX_POOL_COUNT = 26; // A..Z -- far beyond any realistic pool count already.

@Injectable()
export class StructurePresetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
    private readonly scheduleGenerationService: ScheduleGenerationService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    dto: CreateStructurePresetDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.categoriesService.assertCategoryExists(tournamentId, categoryId);

    const existingPhaseCount = await this.prisma.competitionPhase.count({
      where: { categoryId },
    });
    if (existingPhaseCount > 0) {
      throw new ConflictException(
        'Cette catégorie a déjà des phases -- ce générateur ne fonctionne que sur une catégorie vierge.',
      );
    }

    this.assertCombinationIsPossible(dto);

    const unassignedTeams = await this.prisma.team.findMany({
      where: { tournamentId, categoryId, groupId: null },
      orderBy: { position: 'asc' },
    });
    if (unassignedTeams.length !== dto.teamCount) {
      throw new BadRequestException(
        `${unassignedTeams.length} équipe(s) non assignée(s) trouvée(s) dans cette catégorie, ${dto.teamCount} attendue(s) -- ajustez le nombre d'équipes ou complétez la liste des équipes avant de générer la structure.`,
      );
    }
    await this.assertFieldsBelongToTournament(tournamentId, [
      ...dto.fieldIds,
      ...dto.knockoutFieldIds,
    ]);

    const bracketSize = dto.poolCount * dto.qualifiersPerPool;

    const { groupPhaseId, knockoutPhaseId } = await this.prisma.$transaction(
      async (tx) => {
        const groupPhase = await tx.competitionPhase.create({
          data: {
            categoryId,
            name: 'Phase de poules',
            type: CompetitionPhaseType.GROUP_STAGE,
            position: 0,
            ...(dto.matchDurationMinutes !== undefined && {
              matchDurationMinutes: dto.matchDurationMinutes,
            }),
            ...(dto.breakDurationMinutes !== undefined && {
              breakDurationMinutes: dto.breakDurationMinutes,
            }),
            ...(dto.refereesPerMatch !== undefined && {
              refereesPerMatch: dto.refereesPerMatch,
            }),
            ...(dto.doubleRoundRobin !== undefined && {
              doubleRoundRobin: dto.doubleRoundRobin,
            }),
          },
        });

        const groups: Group[] = [];
        for (let i = 0; i < dto.poolCount; i++) {
          const group = await tx.group.create({
            data: {
              phaseId: groupPhase.id,
              name: `Poule ${String.fromCharCode(65 + i)}`,
              position: i,
            },
          });
          await tx.standingRule.create({
            data: { groupId: group.id, tieBreakOrder: DEFAULT_TIE_BREAK_ORDER },
          });
          groups.push(group);
        }

        // Balanced, deterministic round-robin distribution -- pool sizes
        // never differ by more than one team (e.g. 10 teams / 3 pools ->
        // 4/3/3), no strength-seeding involved.
        for (const [index, team] of unassignedTeams.entries()) {
          const group = groups[index % groups.length];
          await tx.team.update({
            where: { id: team.id },
            data: { groupId: group.id },
          });
        }

        const knockoutPhase = await tx.competitionPhase.create({
          data: {
            categoryId,
            name: 'Élimination directe',
            type: CompetitionPhaseType.KNOCKOUT,
            position: 1,
            ...(dto.knockoutMatchDurationMinutes !== undefined && {
              matchDurationMinutes: dto.knockoutMatchDurationMinutes,
            }),
            ...(dto.knockoutBreakDurationMinutes !== undefined && {
              breakDurationMinutes: dto.knockoutBreakDurationMinutes,
            }),
          },
        });
        await tx.knockoutBracket.create({
          data: {
            phaseId: knockoutPhase.id,
            name: 'Tableau final',
            size: bracketSize,
            plannedFieldIds: dto.knockoutFieldIds,
            plannedStartDateTime: new Date(dto.knockoutStartDateTime),
          },
        });

        for (const group of groups) {
          await tx.qualificationRule.create({
            data: {
              groupId: group.id,
              fromPosition: 1,
              toPosition: dto.qualifiersPerPool,
              targetPhaseId: knockoutPhase.id,
            },
          });
        }

        return {
          groupPhaseId: groupPhase.id,
          knockoutPhaseId: knockoutPhase.id,
        };
      },
    );

    // Outside the transaction and via the existing, already-tested service --
    // it manages its own transaction internally and there's no reason to
    // duplicate round-robin fixture generation here.
    await this.scheduleGenerationService.generate(
      organizationId,
      tournamentId,
      groupPhaseId,
      {
        fieldIds: dto.fieldIds,
        startDateTime: dto.startDateTime,
        matchDurationMinutes: dto.matchDurationMinutes,
        breakDurationMinutes: dto.breakDurationMinutes,
        refereesPerMatch: dto.refereesPerMatch,
      },
    );

    return { groupPhaseId, knockoutPhaseId, bracketSize };
  }

  private assertCombinationIsPossible(dto: CreateStructurePresetDto): void {
    const { teamCount, poolCount, qualifiersPerPool } = dto;
    if (poolCount > MAX_POOL_COUNT) {
      throw new BadRequestException(
        `Maximum ${MAX_POOL_COUNT} poules pour ce générateur.`,
      );
    }
    if (poolCount > teamCount) {
      throw new BadRequestException(
        'Le nombre de poules ne peut pas dépasser le nombre d’équipes.',
      );
    }
    const smallestPoolSize = Math.floor(teamCount / poolCount);
    if (qualifiersPerPool > smallestPoolSize) {
      throw new BadRequestException(
        `Avec ${teamCount} équipes réparties en ${poolCount} poules, la plus petite poule ne compte que ${smallestPoolSize} équipe(s) -- impossible d'en qualifier ${qualifiersPerPool}.`,
      );
    }
    const bracketSize = poolCount * qualifiersPerPool;
    if (!isPowerOfTwo(bracketSize)) {
      throw new BadRequestException(
        `${poolCount} poule(s) × ${qualifiersPerPool} qualifié(s) = ${bracketSize} équipe(s) qualifiée(s) -- ce nombre doit être une puissance de 2 (2, 4, 8, 16…) pour former un tableau à élimination directe.`,
      );
    }
  }

  private async assertFieldsBelongToTournament(
    tournamentId: string,
    fieldIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(fieldIds)];
    const fields = await this.prisma.field.findMany({
      where: { id: { in: uniqueIds }, venue: { tournamentId } },
    });
    if (fields.length !== uniqueIds.length) {
      throw new BadRequestException(
        "Un ou plusieurs terrains n'appartiennent pas à ce tournoi.",
      );
    }
  }
}
