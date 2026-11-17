import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClubDirectoryService } from './club-directory.service';

@ApiTags('club-directory')
@Controller('club-directory')
export class ClubDirectoryController {
  constructor(private readonly clubDirectoryService: ClubDirectoryService) {}

  // Signed-in organizers only (global JwtAuthGuard): it's the team form's
  // club autocomplete. Same limit as the venue address search.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('search')
  search(@Query('q') q: string | undefined) {
    return this.clubDirectoryService.search(q ?? '');
  }
}
