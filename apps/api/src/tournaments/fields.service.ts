import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Field } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { TournamentsService } from './tournaments.service';
import { VenuesService } from './venues.service';

@Injectable()
export class FieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly venuesService: VenuesService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    venueId: string,
    dto: CreateFieldDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.venuesService.assertVenueExists(tournamentId, venueId);
    await this.assertNameAvailable(venueId, dto.name);

    const field = await this.prisma.field.create({
      data: {
        venueId,
        name: dto.name,
        surface: dto.surface,
        position: dto.position ?? 0,
      },
    });
    return this.toSummary(field);
  }

  async list(organizationId: string, tournamentId: string, venueId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.venuesService.assertVenueExists(tournamentId, venueId);
    const fields = await this.prisma.field.findMany({
      where: { venueId },
      orderBy: { position: 'asc' },
    });
    return fields.map((field) => this.toSummary(field));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    fieldId: string,
    dto: UpdateFieldDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const field = await this.getOrThrowForTournament(tournamentId, fieldId);
    if (dto.name && dto.name !== field.name) {
      await this.assertNameAvailable(field.venueId, dto.name, fieldId);
    }

    const updated = await this.prisma.field.update({
      where: { id: fieldId },
      data: { name: dto.name, surface: dto.surface, position: dto.position },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    fieldId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, fieldId);
    await this.prisma.field.delete({ where: { id: fieldId } });
  }

  /** Used by TimeSlotsService to validate a fieldId belongs to the tournament in the URL. */
  async assertFieldExists(
    tournamentId: string,
    fieldId: string,
  ): Promise<Field> {
    return this.getOrThrowForTournament(tournamentId, fieldId);
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    fieldId: string,
  ): Promise<Field> {
    const field = await this.prisma.field.findUnique({
      where: { id: fieldId },
      include: { venue: true },
    });
    if (!field || field.venue.tournamentId !== tournamentId) {
      throw new NotFoundException('Terrain introuvable.');
    }
    return field;
  }

  private async assertNameAvailable(
    venueId: string,
    name: string,
    excludingFieldId?: string,
  ): Promise<void> {
    const existing = await this.prisma.field.findFirst({
      where: {
        venueId,
        name,
        ...(excludingFieldId ? { id: { not: excludingFieldId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException('Un terrain porte déjà ce nom pour ce site.');
    }
  }

  private toSummary(field: Field) {
    return {
      id: field.id,
      name: field.name,
      surface: field.surface,
      position: field.position,
    };
  }
}
