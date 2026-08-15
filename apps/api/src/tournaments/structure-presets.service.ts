import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CompetitionPhaseType, Group } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPowerOfTwo } from './bracket-seeding.util';
import { CategoriesService } from './categories.service';
import {
  CreateStructurePresetDto,
  StructurePresetFormat,
} from './dto/create-structure-preset.dto';
import { DEFAULT_TIE_BREAK_ORDER } from './standing-rule.constants';
import { TournamentsService } from './tournaments.service';

// Name shared by the single fictitious pool phase and its single group in
// KNOCKOUT_ONLY -- QualificationRule always points from a group's standings,
// so even a "no pools" format needs one group to seed the bracket from. With
// no matches ever played in it, standings default to alphabetical team-name
// order -- a fine, deterministic seeding. Same pattern already used by
// infra/scripts/seed-demo-data.mjs's buildKnockoutOnlyCategory.
const KNOCKOUT_ONLY_SEED_NAME = 'Équipes engagées';
const DEFAULT_KNOCKOUT_NAME = 'Tableau final';

const MAX_POOL_COUNT = 26; // A..Z -- far beyond any realistic pool count already.

@Injectable()
export class StructurePresetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
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

    if (dto.format === StructurePresetFormat.KNOCKOUT_ONLY) {
      return this.createKnockoutOnly(categoryId, dto, unassignedTeams);
    }
    return this.createWithPoolPhase(categoryId, dto, unassignedTeams);
  }

  private async createWithPoolPhase(
    categoryId: string,
    dto: CreateStructurePresetDto,
    unassignedTeams: { id: string }[],
  ) {
    const poolCount = dto.poolCount!;
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
        for (let i = 0; i < poolCount; i++) {
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

        // POOLS_ONLY stops here -- a championship with no knockout phase at
        // all, nothing left to qualify anyone into.
        if (dto.format === StructurePresetFormat.POOLS_ONLY) {
          return { groupPhaseId: groupPhase.id, tiers: [] };
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
        for (const [index, tier] of dto.tiers!.entries()) {
          const tierPhase = await tx.competitionPhase.create({
            data: {
              categoryId,
              name: tier.name,
              type: CompetitionPhaseType.KNOCKOUT,
              position: index + 1,
            },
          });

          // Best-of-position candidates (if any) join the FIRST tier's
          // bracket alongside its direct per-pool qualifiers.
          const bestCount =
            index === 0 ? (dto.bestOfPosition?.bestCount ?? 0) : 0;
          const bracketSize = poolCount * tier.qualifiersPerPool + bestCount;
          await tx.knockoutBracket.create({
            data: {
              phaseId: tierPhase.id,
              name: tier.name,
              size: bracketSize,
              hasRankingMatch: tier.hasRankingMatch ?? false,
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

    return { groupPhaseId, tiers };
  }

  // A pure knockout still needs one "seeding" group in the data model --
  // QualificationRule always points from a group's standings, there's no way
  // to feed a bracket directly from a flat team list. With no matches ever
  // played in this fictitious group, its standings default to alphabetical
  // team-name order, a fine deterministic seeding. Same pattern as
  // infra/scripts/seed-demo-data.mjs's buildKnockoutOnlyCategory. This group
  // (and its phase) stay real, editable rows -- visible on the Structure and
  // Calendrier pages like any other, just with no matches to schedule in it.
  private async createKnockoutOnly(
    categoryId: string,
    dto: CreateStructurePresetDto,
    unassignedTeams: { id: string }[],
  ) {
    const { groupPhaseId, tiers } = await this.prisma.$transaction(
      async (tx) => {
        // No match/break/referee/round-robin settings here -- no match is
        // ever generated on this phase, they'd stay inert in the database.
        const seedPhase = await tx.competitionPhase.create({
          data: {
            categoryId,
            name: KNOCKOUT_ONLY_SEED_NAME,
            type: CompetitionPhaseType.GROUP_STAGE,
            position: 0,
          },
        });
        const seedGroup = await tx.group.create({
          data: {
            phaseId: seedPhase.id,
            name: KNOCKOUT_ONLY_SEED_NAME,
            position: 0,
          },
        });
        await tx.standingRule.create({
          data: {
            groupId: seedGroup.id,
            tieBreakOrder: DEFAULT_TIE_BREAK_ORDER,
          },
        });

        for (const team of unassignedTeams) {
          await tx.team.update({
            where: { id: team.id },
            data: { groupId: seedGroup.id },
          });
        }

        const knockoutName = dto.knockoutName?.trim() || DEFAULT_KNOCKOUT_NAME;
        const knockoutPhase = await tx.competitionPhase.create({
          data: {
            categoryId,
            name: knockoutName,
            type: CompetitionPhaseType.KNOCKOUT,
            position: 1,
          },
        });
        await tx.knockoutBracket.create({
          data: {
            phaseId: knockoutPhase.id,
            name: knockoutName,
            size: dto.teamCount,
            hasRankingMatch: dto.hasRankingMatch ?? false,
          },
        });
        await tx.qualificationRule.create({
          data: {
            groupId: seedGroup.id,
            fromPosition: 1,
            toPosition: dto.teamCount,
            targetPhaseId: knockoutPhase.id,
          },
        });

        return {
          groupPhaseId: seedPhase.id,
          tiers: [
            {
              phaseId: knockoutPhase.id,
              name: knockoutName,
              bracketSize: dto.teamCount,
            },
          ],
        };
      },
    );

    return { groupPhaseId, tiers };
  }

  private assertCombinationIsPossible(dto: CreateStructurePresetDto): void {
    if (dto.format === StructurePresetFormat.KNOCKOUT_ONLY) {
      if (!isPowerOfTwo(dto.teamCount)) {
        throw new BadRequestException(
          `Pour un tableau à élimination directe seule, le nombre d'équipes doit être une puissance de 2 (2, 4, 8, 16…) -- ${dto.teamCount} équipe(s) ne convient pas.`,
        );
      }
      return;
    }

    const teamCount = dto.teamCount;
    const poolCount = dto.poolCount!;
    const bestOfPosition = dto.bestOfPosition;
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

    // POOLS_ONLY has no knockout tier to qualify into -- nothing left to
    // validate once the pool count itself checks out.
    if (dto.format === StructurePresetFormat.POOLS_ONLY) {
      return;
    }

    const tiers = dto.tiers!;
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
}
