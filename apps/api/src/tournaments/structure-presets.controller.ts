import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { CreateStructurePresetDto } from './dto/create-structure-preset.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { StructurePresetsService } from './structure-presets.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class StructurePresetsController {
  constructor(
    private readonly structurePresetsService: StructurePresetsService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Post('categories/:categoryId/structure-presets')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: CreateStructurePresetDto,
  ) {
    return this.structurePresetsService.create(
      organizationId,
      tournamentId,
      categoryId,
      dto,
    );
  }
}
