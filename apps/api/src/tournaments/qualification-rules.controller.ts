import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { CreateQualificationRuleDto } from './dto/create-qualification-rule.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { QualificationRulesService } from './qualification-rules.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class QualificationRulesController {
  constructor(
    private readonly qualificationRulesService: QualificationRulesService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Post('groups/:groupId/qualification-rules')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
    @Body() dto: CreateQualificationRuleDto,
  ) {
    return this.qualificationRulesService.create(
      organizationId,
      tournamentId,
      groupId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('groups/:groupId/qualification-rules')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.qualificationRulesService.list(
      organizationId,
      tournamentId,
      groupId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('qualification-rules/:ruleId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.qualificationRulesService.remove(
      organizationId,
      tournamentId,
      ruleId,
    );
  }
}
