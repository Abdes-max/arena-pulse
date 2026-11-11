import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RegistrationsService } from './registrations.service';

/** The public site's "Inscriptions" block -- readable without a player account. */
@ApiTags('public')
@Public()
@Controller('public')
export class PublicRegistrationInfoController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get('tournaments/:slug/registration-info')
  get(@Param('slug') slug: string) {
    return this.registrationsService.getRegistrationInfo(slug);
  }
}
