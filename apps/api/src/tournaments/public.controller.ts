import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Public } from '../auth/decorators/public.decorator';
import { PublicService } from './public.service';

/**
 * Read-only, unauthenticated endpoints for the public tournament site —
 * everything is looked up by slug (never id/organizationId, which visitors
 * don't know), and only a PUBLISHED tournament is ever reachable here.
 */
@ApiTags('public')
@Public()
@Controller('public/tournaments')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get()
  listTournaments(@Query('limit') limit?: string) {
    return this.publicService.listTournaments(
      limit ? Number(limit) : undefined,
    );
  }

  // Registered before the ':slug' wildcard route below -- otherwise a
  // request for /public/tournaments/search would match :slug with
  // slug === 'search' instead of reaching this handler.
  @Get('search')
  searchTournaments(
    @Query('q') q?: string,
    @Query('sportId') sportId?: string,
    @Query('location') location?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.publicService.searchTournaments({
      q,
      sportId,
      location,
      dateFrom,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':slug')
  getTournament(@Param('slug') slug: string) {
    return this.publicService.getTournament(slug);
  }

  @Get(':slug/categories')
  listCategories(@Param('slug') slug: string) {
    return this.publicService.listCategories(slug);
  }

  @Get(':slug/categories/:categoryId/phases')
  listPhases(
    @Param('slug') slug: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.publicService.listPhases(slug, categoryId);
  }

  @Get(':slug/teams')
  listTeams(
    @Param('slug') slug: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.publicService.listTeams(slug, categoryId);
  }

  @Get(':slug/teams/:teamId')
  getTeam(@Param('slug') slug: string, @Param('teamId') teamId: string) {
    return this.publicService.getTeam(slug, teamId);
  }

  @Get(':slug/groups/:groupId/standings')
  getStandings(@Param('slug') slug: string, @Param('groupId') groupId: string) {
    return this.publicService.getStandings(slug, groupId);
  }

  @Get(':slug/groups/:groupId/qualifications')
  getQualifications(
    @Param('slug') slug: string,
    @Param('groupId') groupId: string,
  ) {
    return this.publicService.getQualifications(slug, groupId);
  }

  @Get(':slug/phases/:phaseId/matches')
  listPhaseMatches(
    @Param('slug') slug: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.publicService.listPhaseMatches(slug, phaseId);
  }

  @Get(':slug/knockout-brackets/:bracketId/matches')
  listBracketMatches(
    @Param('slug') slug: string,
    @Param('bracketId') bracketId: string,
  ) {
    return this.publicService.listBracketMatches(slug, bracketId);
  }

  @Get(':slug/matches/upcoming')
  getUpcomingMatches(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
  ) {
    return this.publicService.getUpcomingMatches(
      slug,
      limit ? Number(limit) : undefined,
    );
  }

  @Sse(':slug/events')
  streamEvents(@Param('slug') slug: string): Observable<MessageEvent> {
    return this.publicService.streamMatchEvents(slug);
  }
}
