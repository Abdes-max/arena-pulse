import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Division } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class DivisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    dto: CreateDivisionDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.categoriesService.assertCategoryExists(tournamentId, categoryId);
    await this.assertNameAvailable(categoryId, dto.name);

    const division = await this.prisma.division.create({
      data: {
        categoryId,
        name: dto.name,
        colorHex: dto.colorHex,
        position: dto.position ?? 0,
      },
    });
    return this.toSummary(division);
  }

  async list(organizationId: string, tournamentId: string, categoryId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.categoriesService.assertCategoryExists(tournamentId, categoryId);
    const divisions = await this.prisma.division.findMany({
      where: { categoryId },
      orderBy: { position: 'asc' },
    });
    return divisions.map((division) => this.toSummary(division));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    divisionId: string,
    dto: UpdateDivisionDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const division = await this.getOrThrowForTournament(
      tournamentId,
      divisionId,
    );
    if (dto.name && dto.name !== division.name) {
      await this.assertNameAvailable(division.categoryId, dto.name, divisionId);
    }

    const updated = await this.prisma.division.update({
      where: { id: divisionId },
      data: { name: dto.name, colorHex: dto.colorHex, position: dto.position },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    divisionId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, divisionId);
    await this.prisma.division.delete({ where: { id: divisionId } });
  }

  /** Used by TeamsService to validate an optional divisionId belongs to the team's category. */
  async assertDivisionExists(
    categoryId: string,
    divisionId: string,
  ): Promise<Division> {
    const division = await this.prisma.division.findUnique({
      where: { id: divisionId },
    });
    if (!division || division.categoryId !== categoryId) {
      throw new NotFoundException('Division introuvable.');
    }
    return division;
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    divisionId: string,
  ): Promise<Division> {
    const division = await this.prisma.division.findUnique({
      where: { id: divisionId },
      include: { category: true },
    });
    if (!division || division.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Division introuvable.');
    }
    return division;
  }

  private async assertNameAvailable(
    categoryId: string,
    name: string,
    excludingDivisionId?: string,
  ): Promise<void> {
    const existing = await this.prisma.division.findFirst({
      where: {
        categoryId,
        name,
        ...(excludingDivisionId ? { id: { not: excludingDivisionId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une division porte déjà ce nom pour cette catégorie.',
      );
    }
  }

  private toSummary(division: Division) {
    return {
      id: division.id,
      name: division.name,
      colorHex: division.colorHex,
      position: division.position,
    };
  }
}
