import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { GeocodingService } from './geocoding.service';

@ApiTags('geocoding')
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  // Signed-in organizers only (global JwtAuthGuard): it's the venue form's
  // autocomplete, not a public geocoder. One call per keystroke pause, so a
  // looser limit than the auth endpoints but still capped.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('search')
  search(
    @Query('q') q: string | undefined,
    @Query('lang') lang: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ) {
    return this.geocodingService.search(
      q ?? '',
      lang ?? acceptLanguage?.slice(0, 2),
    );
  }
}
