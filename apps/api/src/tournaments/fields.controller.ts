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
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { FieldsService } from './fields.service';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class FieldsController {
  constructor(private readonly fieldsService: FieldsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Post('venues/:venueId/fields')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('venueId') venueId: string,
    @Body() dto: CreateFieldDto,
  ) {
    return this.fieldsService.create(
      organizationId,
      tournamentId,
      venueId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('venues/:venueId/fields')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('venueId') venueId: string,
  ) {
    return this.fieldsService.list(organizationId, tournamentId, venueId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Patch('fields/:fieldId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFieldDto,
  ) {
    return this.fieldsService.update(
      organizationId,
      tournamentId,
      fieldId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('fields/:fieldId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.fieldsService.remove(organizationId, tournamentId, fieldId);
  }
}
