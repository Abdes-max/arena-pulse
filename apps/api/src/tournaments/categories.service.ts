import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, Division } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    dto: CreateCategoryDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.assertNameAvailable(tournamentId, dto.name);

    const category = await this.prisma.category.create({
      data: {
        tournamentId,
        name: dto.name,
        position: dto.position ?? 0,
        registrationFeeCents: dto.registrationFeeCents,
        registrationFeeCurrency: dto.registrationFeeCurrency,
      },
    });
    return this.toSummary(category, []);
  }

  async list(organizationId: string, tournamentId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const categories = await this.prisma.category.findMany({
      where: { tournamentId },
      include: { divisions: { orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' },
    });
    return categories.map((category) =>
      this.toSummary(category, category.divisions),
    );
  }

  async update(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const category = await this.getOrThrow(tournamentId, categoryId);
    if (dto.name && dto.name !== category.name) {
      await this.assertNameAvailable(tournamentId, dto.name, categoryId);
    }

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        position: dto.position,
        registrationFeeCents: dto.registrationFeeCents,
        registrationFeeCurrency: dto.registrationFeeCurrency,
      },
    });
    return this.toSummary(updated, []);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, categoryId);
    await this.prisma.category.delete({ where: { id: categoryId } });
  }

  /** Used by DivisionsService to validate a categoryId belongs to the tournament in the URL. */
  async assertCategoryExists(
    tournamentId: string,
    categoryId: string,
  ): Promise<Category> {
    return this.getOrThrow(tournamentId, categoryId);
  }

  private async getOrThrow(
    tournamentId: string,
    categoryId: string,
  ): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.tournamentId !== tournamentId) {
      throw new NotFoundException('Catégorie introuvable.');
    }
    return category;
  }

  private async assertNameAvailable(
    tournamentId: string,
    name: string,
    excludingCategoryId?: string,
  ): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: {
        tournamentId,
        name,
        ...(excludingCategoryId ? { id: { not: excludingCategoryId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une catégorie porte déjà ce nom pour ce tournoi.',
      );
    }
  }

  private toSummary(category: Category, divisions: Division[]) {
    return {
      id: category.id,
      name: category.name,
      position: category.position,
      registrationFeeCents: category.registrationFeeCents,
      registrationFeeCurrency: category.registrationFeeCurrency,
      divisions: divisions.map((division) => ({
        id: division.id,
        name: division.name,
        colorHex: division.colorHex,
        position: division.position,
      })),
    };
  }
}
