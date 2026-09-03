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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ConfirmSubscriptionPaymentDto } from './dto/confirm-subscription-payment.dto';
import { RequireOrgRole } from './decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { OrganizationsService } from './organizations.service';
import { MailLang } from '../mail/decorators/mail-lang.decorator';
import type { MailLanguage } from '../mail/mail-language';

@ApiTags('organizations')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/subscription')
export class OrganizationSubscriptionController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Get()
  getStatus(@Param('organizationId') organizationId: string) {
    return this.organizationsService.getSubscriptionStatus(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Get('history')
  getHistory(@Param('organizationId') organizationId: string) {
    return this.organizationsService.listSubscriptionHistory(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post()
  subscribe(@Param('organizationId') organizationId: string) {
    return this.organizationsService.subscribe(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  confirmPayment(
    @Param('organizationId') organizationId: string,
    @Body() dto: ConfirmSubscriptionPaymentDto,
    @MailLang() lang: MailLanguage,
  ) {
    return this.organizationsService.confirmSubscriptionPayment(
      organizationId,
      dto.sessionId,
      lang,
    );
  }

  /** iOS counterpart of confirm above -- see OrganizationsService.confirmSubscriptionPaymentViaIap. */
  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post('confirm-iap')
  confirmPaymentViaIap(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @MailLang() lang: MailLanguage,
  ) {
    return this.organizationsService.confirmSubscriptionPaymentViaIap(
      organizationId,
      user.id,
      lang,
    );
  }
}
