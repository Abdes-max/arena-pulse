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
import { Public } from '../auth/decorators/public.decorator';
import { CurrentSuperAdmin } from '../super-admin-auth/decorators/current-super-admin.decorator';
import { SuperAdminJwtAuthGuard } from '../super-admin-auth/guards/super-admin-jwt-auth.guard';
import type { AuthenticatedSuperAdmin } from '../super-admin-auth/strategies/super-admin-jwt.strategy';
import { DeleteOrganizationDto } from './dto/delete-organization.dto';
import { SuperAdminOrganizationsService } from './super-admin-organizations.service';

@ApiTags('super-admin')
@Public()
@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/organizations')
export class SuperAdminOrganizationsController {
  constructor(
    private readonly organizationsService: SuperAdminOrganizationsService,
  ) {}

  @Get()
  list() {
    return this.organizationsService.list();
  }

  @Get(':organizationId')
  getDetail(@Param('organizationId') organizationId: string) {
    return this.organizationsService.getDetail(organizationId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':organizationId/suspend')
  suspend(
    @Param('organizationId') organizationId: string,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.organizationsService.suspend(organizationId, superAdmin.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post(':organizationId/reactivate')
  reactivate(
    @Param('organizationId') organizationId: string,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.organizationsService.reactivate(organizationId, superAdmin.id);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':organizationId')
  deleteOrganization(
    @Param('organizationId') organizationId: string,
    @Body() dto: DeleteOrganizationDto,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.organizationsService.deleteOrganization(
      organizationId,
      superAdmin.id,
      dto,
    );
  }
}
