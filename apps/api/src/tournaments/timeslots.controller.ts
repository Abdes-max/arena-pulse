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
import { CreateTimeSlotDto } from './dto/create-timeslot.dto';
import { UpdateTimeSlotDto } from './dto/update-timeslot.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { TimeSlotsService } from './timeslots.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class TimeSlotsController {
  constructor(private readonly timeSlotsService: TimeSlotsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Post('fields/:fieldId/timeslots')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: CreateTimeSlotDto,
  ) {
    return this.timeSlotsService.create(
      organizationId,
      tournamentId,
      fieldId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('fields/:fieldId/timeslots')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.timeSlotsService.list(organizationId, tournamentId, fieldId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Patch('timeslots/:timeSlotId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('timeSlotId') timeSlotId: string,
    @Body() dto: UpdateTimeSlotDto,
  ) {
    return this.timeSlotsService.update(
      organizationId,
      tournamentId,
      timeSlotId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('timeslots/:timeSlotId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('timeSlotId') timeSlotId: string,
  ) {
    return this.timeSlotsService.remove(
      organizationId,
      tournamentId,
      timeSlotId,
    );
  }
}
