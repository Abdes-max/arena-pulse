import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QualificationRule } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQualificationRuleDto } from './dto/create-qualification-rule.dto';
import { GroupsService } from './groups.service';
import { PhasesService } from './phases.service';
import { TournamentsService } from './tournaments.service';

type RuleWithTargetPhase = QualificationRule & {
  targetPhase: { name: string };
};

@Injectable()
export class QualificationRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly groupsService: GroupsService,
    private readonly phasesService: PhasesService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    dto: CreateQualificationRuleDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const group = await this.groupsService.assertGroupExists(
      tournamentId,
      groupId,
    );
    if (dto.toPosition < dto.fromPosition) {
      throw new BadRequestException(
        'La position de fin doit être supérieure ou égale à la position de départ.',
      );
    }
    const targetPhase = await this.phasesService.assertPhaseExists(
      tournamentId,
      dto.targetPhaseId,
    );
    if (targetPhase.categoryId !== group.phase.categoryId) {
      throw new BadRequestException(
        "La phase cible doit appartenir à la même catégorie que la poule d'origine.",
      );
    }
    if (targetPhase.id === group.phaseId) {
      throw new BadRequestException(
        'La phase cible doit être différente de la phase source.',
      );
    }

    const rule = await this.prisma.qualificationRule.create({
      data: {
        groupId,
        fromPosition: dto.fromPosition,
        toPosition: dto.toPosition,
        targetPhaseId: dto.targetPhaseId,
      },
      include: { targetPhase: true },
    });
    return this.toSummary(rule);
  }

  async list(organizationId: string, tournamentId: string, groupId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.groupsService.assertGroupExists(tournamentId, groupId);
    const rules = await this.prisma.qualificationRule.findMany({
      where: { groupId },
      include: { targetPhase: true },
      orderBy: { fromPosition: 'asc' },
    });
    return rules.map((rule) => this.toSummary(rule));
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    ruleId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, ruleId);
    await this.prisma.qualificationRule.delete({ where: { id: ruleId } });
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    ruleId: string,
  ): Promise<QualificationRule> {
    const rule = await this.prisma.qualificationRule.findUnique({
      where: { id: ruleId },
      include: {
        group: { include: { phase: { include: { category: true } } } },
      },
    });
    if (!rule || rule.group.phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Règle de qualification introuvable.');
    }
    return rule;
  }

  private toSummary(rule: RuleWithTargetPhase) {
    return {
      id: rule.id,
      groupId: rule.groupId,
      fromPosition: rule.fromPosition,
      toPosition: rule.toPosition,
      targetPhaseId: rule.targetPhaseId,
      targetPhaseName: rule.targetPhase.name,
    };
  }
}
