import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClubDirectoryService } from '../club-directory/club-directory.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ConfirmRegistrationPaymentDto } from './dto/confirm-registration-payment.dto';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { RegistrationsService } from './registrations.service';

// Signed-in TournArena account (the global JwtAuthGuard): the same account
// whether it also organizes tournaments or only registers teams.
@ApiTags('public')
@Controller('public')
export class PublicRegistrationsController {
  constructor(
    private readonly registrationsService: RegistrationsService,
    private readonly clubDirectoryService: ClubDirectoryService,
  ) {}

  @Post('tournaments/:slug/categories/:categoryId/registrations')
  create(
    @Param('slug') slug: string,
    @Param('categoryId') categoryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRegistrationDto,
  ) {
    return this.registrationsService.createForPlayer(
      slug,
      categoryId,
      user.id,
      dto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('registrations/:registrationId/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('registrationId') registrationId: string,
  ) {
    return this.registrationsService.cancelForPlayer(user.id, registrationId);
  }

  @Get('registrations/me')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.listForPlayer(user.id);
  }

  // The registration form's club search -- same directory and limit as the
  // organizer's (ClubDirectoryController), for signed-in team managers only.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('registrations/club-search')
  searchClubs(@Query('q') q?: string, @Query('sport') sport?: string) {
    return this.clubDirectoryService.search(q ?? '', sport ?? 'football');
  }

  @Get('registrations/me/stats')
  myStats(@CurrentUser() user: AuthenticatedUser) {
    return this.registrationsService.statsForPlayer(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('registrations/confirm')
  async confirmPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmRegistrationPaymentDto,
  ) {
    await this.registrationsService.confirmRegistrationPayment(
      user.id,
      dto.sessionId,
    );
    return this.registrationsService.listForPlayer(user.id);
  }
}
