import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { DivisionsController } from './divisions.controller';
import { DivisionsService } from './divisions.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [
    TournamentsController,
    CategoriesController,
    DivisionsController,
  ],
  providers: [TournamentsService, CategoriesService, DivisionsService],
})
export class TournamentsModule {}
