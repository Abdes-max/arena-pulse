import { Injectable, NotFoundException } from '@nestjs/common';
import { Referee } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRefereeDto } from './dto/create-referee.dto';
import { UpdateRefereeDto } from './dto/update-referee.dto';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class RefereesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    dto: CreateRefereeDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );

    const referee = await this.prisma.referee.create({
      data: {
        tournamentId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
      },
    });
    return this.toSummary(referee);
  }

  async list(organizationId: string, tournamentId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const referees = await this.prisma.referee.findMany({
      where: { tournamentId },
      orderBy: { lastName: 'asc' },
    });
    return referees.map((referee) => this.toSummary(referee));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    refereeId: string,
    dto: UpdateRefereeDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, refereeId);

    const updated = await this.prisma.referee.update({
      where: { id: refereeId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
      },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    refereeId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, refereeId);
    await this.prisma.referee.delete({ where: { id: refereeId } });
  }

  /** Used by MatchesService to validate a refereeId belongs to the tournament in the URL. */
  async assertRefereeExists(
    tournamentId: string,
    refereeId: string,
  ): Promise<Referee> {
    return this.getOrThrow(tournamentId, refereeId);
  }

  private async getOrThrow(
    tournamentId: string,
    refereeId: string,
  ): Promise<Referee> {
    const referee = await this.prisma.referee.findUnique({
      where: { id: refereeId },
    });
    if (!referee || referee.tournamentId !== tournamentId) {
      throw new NotFoundException('Arbitre introuvable.');
    }
    return referee;
  }

  private toSummary(referee: Referee) {
    return {
      id: referee.id,
      firstName: referee.firstName,
      lastName: referee.lastName,
      email: referee.email,
      phone: referee.phone,
    };
  }
}
