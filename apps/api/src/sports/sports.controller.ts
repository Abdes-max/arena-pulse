import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SportsService } from './sports.service';

@ApiTags('sports')
@Controller('sports')
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  // Public (feat/045): the landing page's "Sports" nav dropdown lists these
  // for a logged-out visitor -- just reference data (sport names), nothing
  // sensitive, same posture as public.controller.ts's tournament directory.
  @Public()
  @Get()
  list() {
    return this.sportsService.list();
  }
}
