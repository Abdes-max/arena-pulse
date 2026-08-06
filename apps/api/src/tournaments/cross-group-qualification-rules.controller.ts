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
import { CrossGroupQualificationRulesService } from './cross-group-qualification-rules.service';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { CreateCrossGroupQualificationRuleDto } from './dto/create-cross-group-qualification-rule.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class CrossGroupQualificationRulesController {
  constructor(
    private readonly crossGroupQualificationRulesService: CrossGroupQualificationRulesService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Post('phases/:phaseId/cross-group-qualification-rules')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateCrossGroupQualificationRuleDto,
  ) {
    return this.crossGroupQualificationRulesService.create(
      organizationId,
      tournamentId,
      phaseId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('phases/:phaseId/cross-group-qualification-rules')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.crossGroupQualificationRulesService.list(
      organizationId,
      tournamentId,
      phaseId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('cross-group-qualification-rules/:ruleId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.crossGroupQualificationRulesService.remove(
      organizationId,
      tournamentId,
      ruleId,
    );
  }
}
