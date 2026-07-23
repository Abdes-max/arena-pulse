import { Injectable, NotFoundException } from '@nestjs/common';
import { StandingRule } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupsService } from './groups.service';
import { UpdateStandingRuleDto } from './dto/update-standing-rule.dto';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class StandingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly groupsService: GroupsService,
  ) {}

  async get(organizationId: string, tournamentId: string, groupId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.groupsService.assertGroupExists(tournamentId, groupId);
    return this.toSummary(await this.getOrThrow(groupId));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    groupId: string,
    dto: UpdateStandingRuleDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.groupsService.assertGroupExists(tournamentId, groupId);
    await this.getOrThrow(groupId);

    const updated = await this.prisma.standingRule.update({
      where: { groupId },
      data: {
        winPoints: dto.winPoints,
        drawPoints: dto.drawPoints,
        lossPoints: dto.lossPoints,
        tieBreakOrder: dto.tieBreakOrder,
        supplementaryStandingEnabled: dto.supplementaryStandingEnabled,
        penaltyShootoutEnabled: dto.penaltyShootoutEnabled,
      },
    });
    return this.toSummary(updated);
  }

  private async getOrThrow(groupId: string): Promise<StandingRule> {
    const rule = await this.prisma.standingRule.findUnique({
      where: { groupId },
    });
    if (!rule) {
      throw new NotFoundException('Règle de classement introuvable.');
    }
    return rule;
  }

  private toSummary(rule: StandingRule) {
    return {
      groupId: rule.groupId,
      winPoints: rule.winPoints,
      drawPoints: rule.drawPoints,
      lossPoints: rule.lossPoints,
      tieBreakOrder: rule.tieBreakOrder,
      supplementaryStandingEnabled: rule.supplementaryStandingEnabled,
      penaltyShootoutEnabled: rule.penaltyShootoutEnabled,
    };
  }
}
