import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { AddMatchOfficialDto } from './dto/add-match-official.dto';
import { AssignMatchTimeslotDto } from './dto/assign-match-timeslot.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { MatchesService } from './matches.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Patch('matches/:matchId/timeslot')
  moveMatch(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Body() dto: AssignMatchTimeslotDto,
  ) {
    return this.matchesService.moveMatch(
      organizationId,
      tournamentId,
      matchId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Post('matches/:matchId/officials')
  addOfficial(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
    @Body() dto: AddMatchOfficialDto,
  ) {
    return this.matchesService.addOfficial(
      organizationId,
      tournamentId,
      matchId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCORES')
  @Header('Content-Type', 'video/mp4')
  @Header('Content-Disposition', 'attachment; filename="recap.mp4"')
  @Get('matches/:matchId/recap')
  async renderRecap(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('matchId') matchId: string,
  ): Promise<StreamableFile> {
    // A plain Buffer returned from a Nest handler gets JSON.stringify'd
    // (Buffer's toJSON() -> {type:"Buffer",data:[...]}) instead of sent as
    // raw binary -- StreamableFile is Nest's actual mechanism for a binary
    // response body.
    const buffer = await this.matchesService.renderRecap(
      organizationId,
      tournamentId,
      matchId,
    );
    return new StreamableFile(buffer);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('match-officials/:officialId')
  removeOfficial(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('officialId') officialId: string,
  ) {
    return this.matchesService.removeOfficial(
      organizationId,
      tournamentId,
      officialId,
    );
  }
}
