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
import { Public } from '../auth/decorators/public.decorator';
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
  constructor(private readonly registrationsService: RegistrationsService) {}

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

  @Get('registrations/me')
  listMine(@CurrentPlayer() player: AuthenticatedPlayer) {
    return this.registrationsService.listForPlayer(player.id);
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
