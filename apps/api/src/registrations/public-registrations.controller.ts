import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ClubDirectoryService } from '../club-directory/club-directory.service';
import { CurrentPlayer } from '../player-auth/decorators/current-player.decorator';
import { PlayerJwtAuthGuard } from '../player-auth/guards/player-jwt-auth.guard';
import type { AuthenticatedPlayer } from '../player-auth/strategies/player-jwt.strategy';
import { ConfirmRegistrationPaymentDto } from './dto/confirm-registration-payment.dto';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { RegistrationsService } from './registrations.service';

@ApiTags('public')
@Public()
@UseGuards(PlayerJwtAuthGuard)
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
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Body() dto: CreateRegistrationDto,
  ) {
    return this.registrationsService.createForPlayer(
      slug,
      categoryId,
      player.id,
      dto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('registrations/:registrationId/cancel')
  cancel(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Param('registrationId') registrationId: string,
  ) {
    return this.registrationsService.cancelForPlayer(player.id, registrationId);
  }

  @Get('registrations/me')
  listMine(@CurrentPlayer() player: AuthenticatedPlayer) {
    return this.registrationsService.listForPlayer(player.id);
  }

  // The registration form's club search -- same directory and limit as the
  // organizer's (ClubDirectoryController), for signed-in team managers only.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('registrations/club-search')
  searchClubs(@Query('q') q?: string, @Query('sport') sport?: string) {
    return this.clubDirectoryService.search(q ?? '', sport ?? 'football');
  }

  @Get('registrations/me/stats')
  myStats(@CurrentPlayer() player: AuthenticatedPlayer) {
    return this.registrationsService.statsForPlayer(player.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('registrations/confirm')
  async confirmPayment(
    @CurrentPlayer() player: AuthenticatedPlayer,
    @Body() dto: ConfirmRegistrationPaymentDto,
  ) {
    await this.registrationsService.confirmRegistrationPayment(
      player.id,
      dto.sessionId,
    );
    return this.registrationsService.listForPlayer(player.id);
  }
}
