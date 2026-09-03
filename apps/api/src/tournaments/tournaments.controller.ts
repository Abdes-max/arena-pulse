import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { OrganizationRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MailLang } from '../mail/decorators/mail-lang.decorator';
import type { MailLanguage } from '../mail/mail-language';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { ConfirmIapPurchaseDto } from './dto/confirm-iap-purchase.dto';
import { ConfirmPublicationPaymentDto } from './dto/confirm-publication-payment.dto';
import { PayForTeamAdditionDto } from './dto/pay-for-team-addition.dto';
import { PayForTournamentTierDto } from './dto/pay-for-tournament-tier.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentsService } from './tournaments.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTournamentDto,
  ) {
    return this.tournamentsService.create(organizationId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Query('status') status?: string,
  ) {
    return this.tournamentsService.list(organizationId, status);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get(':tournamentId')
  getOne(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.getDetail(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Patch(':tournamentId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournamentsService.update(organizationId, tournamentId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @Post(':tournamentId/logo')
  uploadLogo(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu.');
    }
    return this.tournamentsService.uploadLogo(
      organizationId,
      tournamentId,
      file,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Delete(':tournamentId/logo')
  removeLogo(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.removeLogo(organizationId, tournamentId);
  }

  // Read by the admin UI to gate logos/thème/QR code/export PDF (grey out +
  // upgrade prompt) before the organizer even attempts the action -- the
  // services themselves still reject each gated write server-side
  // (assertPremiumFeaturesUnlocked), this just avoids a round-trip 403 for
  // the common case of a still-free tournament.
  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get(':tournamentId/premium-features')
  async getPremiumFeatures(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    const unlocked = await this.tournamentsService.hasPremiumFeatures(
      organizationId,
      tournamentId,
    );
    return {
      unlocked,
      ...this.tournamentsService.publicationTierConfig(),
    };
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get(':tournamentId/publication-orders')
  listPublicationOrders(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.listPublicationOrders(
      organizationId,
      tournamentId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/publish')
  publish(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.publish(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/publish/upgrade')
  payForTeamAddition(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: PayForTeamAdditionDto,
  ) {
    return this.tournamentsService.payForTeamAdditionTier(
      organizationId,
      tournamentId,
      dto.additionalTeams,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/plan')
  payForTournamentTier(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: PayForTournamentTierDto,
  ) {
    return this.tournamentsService.payForTournamentTier(
      organizationId,
      tournamentId,
      dto.tier,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/publish/confirm')
  confirmPublicationPayment(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ConfirmPublicationPaymentDto,
    @MailLang() lang: MailLanguage,
  ) {
    return this.tournamentsService.confirmPublicationPayment(
      organizationId,
      tournamentId,
      dto.sessionId,
      lang,
    );
  }

  /** iOS counterpart of publish/confirm above -- see ConfirmIapPurchaseDto's own comment and TournamentsService.confirmPublicationPaymentViaIap. */
  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/publish/confirm-iap')
  confirmPublicationPaymentViaIap(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ConfirmIapPurchaseDto,
    @CurrentUser() user: AuthenticatedUser,
    @MailLang() lang: MailLanguage,
  ) {
    return this.tournamentsService.confirmPublicationPaymentViaIap(
      organizationId,
      tournamentId,
      user.id,
      dto,
      lang,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/unpublish')
  unpublish(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.unpublish(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/archive')
  archive(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.archive(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/unarchive')
  unarchive(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.unarchive(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post(':tournamentId/duplicate')
  duplicate(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: DuplicateTournamentDto,
  ) {
    return this.tournamentsService.duplicate(organizationId, tournamentId, dto);
  }
}
