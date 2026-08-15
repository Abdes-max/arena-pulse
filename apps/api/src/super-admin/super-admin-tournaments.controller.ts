import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdminJwtAuthGuard } from '../super-admin-auth/guards/super-admin-jwt-auth.guard';
import { SuperAdminTournamentsService } from './super-admin-tournaments.service';

@ApiTags('super-admin')
@Public()
@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/tournaments')
export class SuperAdminTournamentsController {
  constructor(
    private readonly tournamentsService: SuperAdminTournamentsService,
  ) {}

  @Get()
  list() {
    return this.tournamentsService.list();
  }

  @Get(':tournamentId')
  getDetail(@Param('tournamentId') tournamentId: string) {
    return this.tournamentsService.getDetail(tournamentId);
  }
}
