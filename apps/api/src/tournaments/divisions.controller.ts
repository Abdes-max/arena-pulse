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
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { DivisionsService } from './divisions.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class DivisionsController {
  constructor(private readonly divisionsService: DivisionsService) {}

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post('categories/:categoryId/divisions')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: CreateDivisionDto,
  ) {
    return this.divisionsService.create(
      organizationId,
      tournamentId,
      categoryId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('categories/:categoryId/divisions')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.divisionsService.list(organizationId, tournamentId, categoryId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Patch('divisions/:divisionId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('divisionId') divisionId: string,
    @Body() dto: UpdateDivisionDto,
  ) {
    return this.divisionsService.update(
      organizationId,
      tournamentId,
      divisionId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('divisions/:divisionId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('divisionId') divisionId: string,
  ) {
    return this.divisionsService.remove(
      organizationId,
      tournamentId,
      divisionId,
    );
  }
}
