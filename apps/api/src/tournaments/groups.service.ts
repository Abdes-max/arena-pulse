import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionPhaseType, Group } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { PhasesService } from './phases.service';
import { DEFAULT_TIE_BREAK_ORDER } from './standing-rule.constants';
import { TournamentsService } from './tournaments.service';

type GroupWithPhase = Group & {
  phase: { categoryId: string; type: CompetitionPhaseType };
};

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly phasesService: PhasesService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    dto: CreateGroupDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const phase = await this.phasesService.assertPhaseExists(
      tournamentId,
      phaseId,
    );
    this.assertGroupStage(phase.type);
    await this.assertNameAvailable(phaseId, dto.name);

    // A Group always has exactly one StandingRule (mandatory per the data
    // model), so it's created here alongside the group with sane defaults
    // rather than lazily on first access.
    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: { phaseId, name: dto.name, position: dto.position ?? 0 },
      });
      await tx.standingRule.create({
        data: { groupId: created.id, tieBreakOrder: DEFAULT_TIE_BREAK_ORDER },
      });
      return created;
    });
    return this.toSummary(group);
  }

  async list(organizationId: string, tournamentId: string, phaseId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.phasesService.assertPhaseExists(tournamentId, phaseId);
    const groups = await this.prisma.group.findMany({
      where: { phaseId },
      orderBy: { position: 'asc' },
    });
    return groups.map((group) => this.toSummary(group));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    dto: UpdateGroupDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const group = await this.getOrThrowForTournament(tournamentId, groupId);
    if (dto.name && dto.name !== group.name) {
      await this.assertNameAvailable(group.phaseId, dto.name, groupId);
    }

    const updated = await this.prisma.group.update({
      where: { id: groupId },
      data: { name: dto.name, position: dto.position },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, groupId);
    await this.prisma.group.delete({ where: { id: groupId } });
  }

  /** Used by StandingRulesService/QualificationRulesService/TeamsService to validate a groupId belongs to the tournament in the URL. */
  async assertGroupExists(
    tournamentId: string,
    groupId: string,
  ): Promise<GroupWithPhase> {
    return this.getOrThrowForTournament(tournamentId, groupId);
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    groupId: string,
  ): Promise<GroupWithPhase> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { phase: { include: { category: true } } },
    });
    if (!group || group.phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Poule introuvable.');
    }
    return group;
  }

  private assertGroupStage(type: CompetitionPhaseType): void {
    if (type !== CompetitionPhaseType.GROUP_STAGE) {
      throw new BadRequestException(
        'Les poules ne peuvent être créées que sur une phase de type poule.',
      );
    }
  }

  private async assertNameAvailable(
    phaseId: string,
    name: string,
    excludingGroupId?: string,
  ): Promise<void> {
    const existing = await this.prisma.group.findFirst({
      where: {
        phaseId,
        name,
        ...(excludingGroupId ? { id: { not: excludingGroupId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une poule porte déjà ce nom pour cette phase.',
      );
    }
  }

  private toSummary(group: Group) {
    return {
      id: group.id,
      phaseId: group.phaseId,
      name: group.name,
      position: group.position,
    };
  }
}
