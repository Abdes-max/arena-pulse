import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
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

  // Public: an <img> sends no token. Only serves crests of clubs in our
  // directory (see ClubDirectoryService.crest), cached a week by browsers.
  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Get('logos/:code')
  async logo(
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const crest = await this.clubDirectoryService.crest(code);
    if (!crest) {
      throw new NotFoundException();
    }
    res.setHeader('Cache-Control', 'public, max-age=604800');
    // helmet's default (same-origin) would block the <img> from the dev web
    // server and the mobile app, which load it from another origin -- the
    // /uploads logos escape it by being registered before helmet (main.ts).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return new StreamableFile(crest.data, { type: crest.contentType });
  }
}
