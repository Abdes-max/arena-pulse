import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { BracketsService } from './brackets.service';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { CreateKnockoutBracketDto } from './dto/create-knockout-bracket.dto';
import { UpdateKnockoutBracketDto } from './dto/update-knockout-bracket.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { KnockoutBracketsService } from './knockout-brackets.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class KnockoutBracketsController {
  constructor(
    private readonly knockoutBracketsService: KnockoutBracketsService,
    private readonly bracketsService: BracketsService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Post('phases/:phaseId/knockout-bracket')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateKnockoutBracketDto,
  ) {
    return this.knockoutBracketsService.create(
      organizationId,
      tournamentId,
      phaseId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Patch('knockout-brackets/:bracketId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('bracketId') bracketId: string,
    @Body() dto: UpdateKnockoutBracketDto,
  ) {
    return this.knockoutBracketsService.update(
      organizationId,
      tournamentId,
      bracketId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('knockout-brackets/:bracketId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('bracketId') bracketId: string,
  ) {
    return this.knockoutBracketsService.remove(
      organizationId,
      tournamentId,
      bracketId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Post('knockout-brackets/:bracketId/generate-matches')
  generateMatches(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('bracketId') bracketId: string,
  ) {
    return this.bracketsService.generateMatches(
      organizationId,
      tournamentId,
      bracketId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('knockout-brackets/:bracketId/matches')
  listMatches(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('bracketId') bracketId: string,
  ) {
    return this.bracketsService.listMatches(
      organizationId,
      tournamentId,
      bracketId,
    );
  }
}
