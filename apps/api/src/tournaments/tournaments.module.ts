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
import { FieldsController } from './fields.controller';
import { FieldsService } from './fields.service';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { KnockoutBracketsController } from './knockout-brackets.controller';
import { KnockoutBracketsService } from './knockout-brackets.service';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { PhasesController } from './phases.controller';
import { PhasesService } from './phases.service';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { QualificationRulesController } from './qualification-rules.controller';
import { QualificationRulesService } from './qualification-rules.service';
import { RefereesController } from './referees.controller';
import { RefereesService } from './referees.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleGenerationService } from './schedule-generation.service';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { StandingRulesController } from './standing-rules.controller';
import { StandingRulesService } from './standing-rules.service';
import { StandingsController } from './standings.controller';
import { StandingsService } from './standings.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TimeSlotsController } from './timeslots.controller';
import { TimeSlotsService } from './timeslots.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [OrganizationsModule, PermissionsModule],
  controllers: [
    TournamentsController,
    CategoriesController,
    DivisionsController,
    TournamentAdministratorsController,
    TeamsController,
    PlayersController,
    VenuesController,
    FieldsController,
    TimeSlotsController,
    RefereesController,
    PhasesController,
    GroupsController,
    StandingRulesController,
    KnockoutBracketsController,
    QualificationRulesController,
    ScheduleController,
    MatchesController,
    ScoresController,
    StandingsController,
  ],
  providers: [
    TournamentsService,
    CategoriesService,
    DivisionsService,
    TournamentAdministratorsService,
    TournamentPermissionGuard,
    TeamsService,
    PlayersService,
    VenuesService,
    FieldsService,
    TimeSlotsService,
    RefereesService,
    PhasesService,
    GroupsService,
    StandingRulesService,
    KnockoutBracketsService,
    QualificationRulesService,
    ScheduleGenerationService,
    MatchesService,
    ScoresService,
    StandingsService,
  ],
  exports: [TournamentPermissionGuard],
})
export class TournamentsModule {}
