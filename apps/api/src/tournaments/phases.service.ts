import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompetitionPhase,
  Group,
  KnockoutBracket,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { TournamentsService } from './tournaments.service';

type PhaseWithRelations = CompetitionPhase & {
  groups: Group[];
  knockoutBracket: KnockoutBracket | null;
};

@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    dto: CreatePhaseDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.categoriesService.assertCategoryExists(tournamentId, categoryId);
    await this.assertNameAvailable(categoryId, dto.name);

    const phase = await this.prisma.competitionPhase.create({
      data: {
        categoryId,
        name: dto.name,
        type: dto.type,
        position: dto.position ?? 0,
      },
    });
    return this.toSummary({ ...phase, groups: [], knockoutBracket: null });
  }

  async list(organizationId: string, tournamentId: string, categoryId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.categoriesService.assertCategoryExists(tournamentId, categoryId);
    const phases = await this.prisma.competitionPhase.findMany({
      where: { categoryId },
      include: {
        groups: { orderBy: { position: 'asc' } },
        knockoutBracket: true,
      },
      orderBy: { position: 'asc' },
    });
    return phases.map((phase) => this.toSummary(phase));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    dto: UpdatePhaseDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const phase = await this.getOrThrowForTournament(tournamentId, phaseId);
    if (dto.name && dto.name !== phase.name) {
      await this.assertNameAvailable(phase.categoryId, dto.name, phaseId);
    }

    const updated = await this.prisma.competitionPhase.update({
      where: { id: phaseId },
      data: { name: dto.name, position: dto.position },
      include: {
        groups: { orderBy: { position: 'asc' } },
        knockoutBracket: true,
      },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, phaseId);
    await this.prisma.competitionPhase.delete({ where: { id: phaseId } });
  }

  /** Used by GroupsService/KnockoutBracketsService/QualificationRulesService to validate a phaseId belongs to the tournament in the URL. */
  async assertPhaseExists(
    tournamentId: string,
    phaseId: string,
  ): Promise<CompetitionPhase> {
    return this.getOrThrowForTournament(tournamentId, phaseId);
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    phaseId: string,
  ): Promise<PhaseWithRelations> {
    const phase = await this.prisma.competitionPhase.findUnique({
      where: { id: phaseId },
      include: {
        category: true,
        groups: { orderBy: { position: 'asc' } },
        knockoutBracket: true,
      },
    });
    if (!phase || phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Phase introuvable.');
    }
    return phase;
  }

  private async assertNameAvailable(
    categoryId: string,
    name: string,
    excludingPhaseId?: string,
  ): Promise<void> {
    const existing = await this.prisma.competitionPhase.findFirst({
      where: {
        categoryId,
        name,
        ...(excludingPhaseId ? { id: { not: excludingPhaseId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une phase porte déjà ce nom pour cette catégorie.',
      );
    }
  }

  private toSummary(phase: PhaseWithRelations) {
    return {
      id: phase.id,
      name: phase.name,
      type: phase.type,
      position: phase.position,
      groups: phase.groups.map((group) => ({
        id: group.id,
        name: group.name,
        position: group.position,
      })),
      knockoutBracket: phase.knockoutBracket
        ? {
            id: phase.knockoutBracket.id,
            name: phase.knockoutBracket.name,
            size: phase.knockoutBracket.size,
            hasRankingMatch: phase.knockoutBracket.hasRankingMatch,
          }
        : null,
    };
  }
}
