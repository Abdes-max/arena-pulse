import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { DivisionsController } from './divisions.controller';
import { DivisionsService } from './divisions.service';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { TournamentAdministratorsController } from './tournament-administrators.controller';
import { TournamentAdministratorsService } from './tournament-administrators.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [OrganizationsModule, PermissionsModule],
  controllers: [
    TournamentsController,
    CategoriesController,
    DivisionsController,
    TournamentAdministratorsController,
  ],
  providers: [
    TournamentsService,
    CategoriesService,
    DivisionsService,
    TournamentAdministratorsService,
    TournamentPermissionGuard,
  ],
  exports: [TournamentPermissionGuard],
})
export class TournamentsModule {}
