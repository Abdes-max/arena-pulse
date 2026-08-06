import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompetitionPhaseType,
  KnockoutBracket,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnockoutBracketDto } from './dto/create-knockout-bracket.dto';
import { UpdateKnockoutBracketDto } from './dto/update-knockout-bracket.dto';
import { PhasesService } from './phases.service';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class KnockoutBracketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly phasesService: PhasesService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    dto: CreateKnockoutBracketDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const phase = await this.phasesService.assertPhaseExists(
      tournamentId,
      phaseId,
    );
    if (phase.type !== CompetitionPhaseType.KNOCKOUT) {
      throw new BadRequestException(
        'Un tableau ne peut être créé que sur une phase à élimination directe.',
      );
    }
    const existing = await this.prisma.knockoutBracket.findUnique({
      where: { phaseId },
    });
    if (existing) {
      throw new ConflictException('Cette phase possède déjà un tableau.');
    }

    const bracket = await this.prisma.knockoutBracket.create({
      data: {
        phaseId,
        name: dto.name,
        size: dto.size,
        hasRankingMatch: dto.hasRankingMatch ?? false,
      },
    });
    return this.toSummary(bracket);
  }

  async update(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
    dto: UpdateKnockoutBracketDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, bracketId);

    const updated = await this.prisma.knockoutBracket.update({
      where: { id: bracketId },
      data: {
        name: dto.name,
        size: dto.size,
        hasRankingMatch: dto.hasRankingMatch,
      },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, bracketId);
    await this.prisma.knockoutBracket.delete({ where: { id: bracketId } });
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    bracketId: string,
  ): Promise<KnockoutBracket> {
    const bracket = await this.prisma.knockoutBracket.findUnique({
      where: { id: bracketId },
      include: { phase: { include: { category: true } } },
    });
    if (!bracket || bracket.phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Tableau introuvable.');
    }
    return bracket;
  }

  private toSummary(bracket: KnockoutBracket) {
    return {
      id: bracket.id,
      phaseId: bracket.phaseId,
      name: bracket.name,
      size: bracket.size,
      hasRankingMatch: bracket.hasRankingMatch,
      plannedFieldIds: bracket.plannedFieldIds,
      plannedStartDateTime: bracket.plannedStartDateTime?.toISOString() ?? null,
    };
  }
}
