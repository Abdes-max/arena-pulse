import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationsService } from './organizations.service';

/**
 * One account for team managers and organizers: an account created without
 * an organization (a team manager's) creates it here when it starts
 * organizing -- "Organiser un tournoi".
 */
@ApiTags('organizations')
@Controller('organizations')
export class MyOrganizationController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.createForUser(user.id, dto.name);
  }
}
