import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from './decorators/require-org-role.decorator';
import { RedeemLaunchPromoDto } from './dto/redeem-launch-promo.dto';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { OrganizationsService } from './organizations.service';

/** Launch offer code -- see OrganizationsService.redeemLaunchPromo. */
@ApiTags('organizations')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/launch-promo')
export class OrganizationLaunchPromoController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Get()
  getStatus(@Param('organizationId') organizationId: string) {
    return this.organizationsService.getLaunchPromoStatus(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post()
  redeem(
    @Param('organizationId') organizationId: string,
    @Body() dto: RedeemLaunchPromoDto,
  ) {
    return this.organizationsService.redeemLaunchPromo(
      organizationId,
      dto.code,
    );
  }
}
