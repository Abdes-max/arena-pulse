import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Field, Venue } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class VenuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    dto: CreateVenueDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.assertNameAvailable(tournamentId, dto.name);

    const venue = await this.prisma.venue.create({
      data: {
        tournamentId,
        name: dto.name,
        address: dto.address,
        position: dto.position ?? 0,
      },
    });
    return this.toSummary(venue, []);
  }

  async list(organizationId: string, tournamentId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const venues = await this.prisma.venue.findMany({
      where: { tournamentId },
      include: { fields: { orderBy: { position: 'asc' } } },
      orderBy: { position: 'asc' },
    });
    return venues.map((venue) => this.toSummary(venue, venue.fields));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    venueId: string,
    dto: UpdateVenueDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const venue = await this.getOrThrow(tournamentId, venueId);
    if (dto.name && dto.name !== venue.name) {
      await this.assertNameAvailable(tournamentId, dto.name, venueId);
    }

    const updated = await this.prisma.venue.update({
      where: { id: venueId },
      data: { name: dto.name, address: dto.address, position: dto.position },
    });
    return this.toSummary(updated, []);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    venueId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, venueId);
    await this.prisma.venue.delete({ where: { id: venueId } });
  }

  /** Used by FieldsService to validate a venueId belongs to the tournament in the URL. */
  async assertVenueExists(
    tournamentId: string,
    venueId: string,
  ): Promise<Venue> {
    return this.getOrThrow(tournamentId, venueId);
  }

  private async getOrThrow(
    tournamentId: string,
    venueId: string,
  ): Promise<Venue> {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
    });
    if (!venue || venue.tournamentId !== tournamentId) {
      throw new NotFoundException('Site introuvable.');
    }
    return venue;
  }

  private async assertNameAvailable(
    tournamentId: string,
    name: string,
    excludingVenueId?: string,
  ): Promise<void> {
    const existing = await this.prisma.venue.findFirst({
      where: {
        tournamentId,
        name,
        ...(excludingVenueId ? { id: { not: excludingVenueId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException('Un site porte déjà ce nom pour ce tournoi.');
    }
  }

  private toSummary(venue: Venue, fields: Field[]) {
    return {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      position: venue.position,
      fields: fields.map((field) => ({
        id: field.id,
        name: field.name,
        surface: field.surface,
        position: field.position,
      })),
    };
  }
}
