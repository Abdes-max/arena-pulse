import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SuperAdminJwtAuthGuard } from '../super-admin-auth/guards/super-admin-jwt-auth.guard';
import { StatsQueryDto } from './dto/stats-query.dto';
import { SuperAdminStatsService } from './super-admin-stats.service';

@ApiTags('super-admin')
@Public()
@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/stats')
export class SuperAdminStatsController {
  constructor(private readonly statsService: SuperAdminStatsService) {}

  @Get()
  getStats(@Query() query: StatsQueryDto) {
    return this.statsService.getStats(query);
  }
}
