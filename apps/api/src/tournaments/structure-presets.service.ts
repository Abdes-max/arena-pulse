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

    const { groupPhaseId, tiers } = await this.prisma.$transaction(
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

        // Each tier gets its own KNOCKOUT phase + bracket, fed by a
        // QualificationRule per pool over a slice of standing positions --
        // tier 1 covers positions 1..q1, tier 2 covers q1+1..q1+q2, etc, so
        // the same pool phase can feed several different competitions (e.g.
        // Champions League / Europa League / Conference League) from one
        // set of standings.
        const tiers: { phaseId: string; name: string; bracketSize: number }[] =
          [];
        let cursor = 0;
        for (const [index, tier] of dto.tiers.entries()) {
          const tierPhase = await tx.competitionPhase.create({
            data: {
              categoryId,
              name: tier.name,
              type: CompetitionPhaseType.KNOCKOUT,
              position: index + 1,
              ...(dto.knockoutMatchDurationMinutes !== undefined && {
                matchDurationMinutes: dto.knockoutMatchDurationMinutes,
              }),
              ...(dto.knockoutBreakDurationMinutes !== undefined && {
                breakDurationMinutes: dto.knockoutBreakDurationMinutes,
              }),
            },
          });

          // Best-of-position candidates (if any) join the FIRST tier's
          // bracket alongside its direct per-pool qualifiers.
          const bestCount =
            index === 0 ? (dto.bestOfPosition?.bestCount ?? 0) : 0;
          const bracketSize =
            dto.poolCount * tier.qualifiersPerPool + bestCount;
          await tx.knockoutBracket.create({
            data: {
              phaseId: tierPhase.id,
              name: tier.name,
              size: bracketSize,
              plannedFieldIds: dto.knockoutFieldIds,
              plannedStartDateTime: new Date(dto.knockoutStartDateTime),
            },
          });

          for (const group of groups) {
            await tx.qualificationRule.create({
              data: {
                groupId: group.id,
                fromPosition: cursor + 1,
                toPosition: cursor + tier.qualifiersPerPool,
                targetPhaseId: tierPhase.id,
              },
            });
          }
          if (index === 0 && dto.bestOfPosition) {
            await tx.crossGroupQualificationRule.create({
              data: {
                phaseId: groupPhase.id,
                position: dto.bestOfPosition.position,
                bestCount: dto.bestOfPosition.bestCount,
                targetPhaseId: tierPhase.id,
              },
            });
          }

          cursor += tier.qualifiersPerPool;
          tiers.push({ phaseId: tierPhase.id, name: tier.name, bracketSize });
        }

        return { groupPhaseId: groupPhase.id, tiers };
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

    return { groupPhaseId, tiers };
  }

  private assertCombinationIsPossible(dto: CreateStructurePresetDto): void {
    const { teamCount, poolCount, tiers, bestOfPosition } = dto;
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
    const totalDirectQualifiersPerPool = tiers.reduce(
      (sum, tier) => sum + tier.qualifiersPerPool,
      0,
    );
    if (totalDirectQualifiersPerPool > smallestPoolSize) {
      throw new BadRequestException(
        `Avec ${teamCount} équipes réparties en ${poolCount} poules, la plus petite poule ne compte que ${smallestPoolSize} équipe(s) -- impossible d'en qualifier ${totalDirectQualifiersPerPool} au total en cumulant les paliers.`,
      );
    }

    if (bestOfPosition) {
      if (bestOfPosition.bestCount > poolCount) {
        throw new BadRequestException(
          `Impossible de qualifier ${bestOfPosition.bestCount} meilleur(s) classé(s) à la position ${bestOfPosition.position} : il n'y a que ${poolCount} poule(s).`,
        );
      }
      if (bestOfPosition.position <= totalDirectQualifiersPerPool) {
        throw new BadRequestException(
          `La position ${bestOfPosition.position} des meilleurs classés chevauche les qualifiés directs (positions 1 à ${totalDirectQualifiersPerPool}) -- choisissez une position strictement supérieure.`,
        );
      }
      if (bestOfPosition.position > smallestPoolSize) {
        throw new BadRequestException(
          `La position ${bestOfPosition.position} n'existe pas dans toutes les poules -- la plus petite poule ne compte que ${smallestPoolSize} équipe(s).`,
        );
      }
    }

    tiers.forEach((tier, index) => {
      const bestCount = index === 0 ? (bestOfPosition?.bestCount ?? 0) : 0;
      const bracketSize = poolCount * tier.qualifiersPerPool + bestCount;
      if (!isPowerOfTwo(bracketSize)) {
        const detail = bestCount
          ? `${poolCount} poule(s) × ${tier.qualifiersPerPool} qualifié(s) + ${bestCount} meilleur(s) classé(s)`
          : `${poolCount} poule(s) × ${tier.qualifiersPerPool} qualifié(s)`;
        throw new BadRequestException(
          `Palier "${tier.name}" : ${detail} = ${bracketSize} équipe(s) qualifiée(s) -- ce nombre doit être une puissance de 2 (2, 4, 8, 16…) pour former un tableau à élimination directe.`,
        );
      }
    });
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
