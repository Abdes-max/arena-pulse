import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PaymentsModule } from '../payments/payments.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RecapRenderService } from '../recap/recap-render.service';
import { BracketsService } from './brackets.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CrossGroupQualificationRulesController } from './cross-group-qualification-rules.controller';
import { CrossGroupQualificationRulesService } from './cross-group-qualification-rules.service';
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
import { PublicController } from './public.controller';
import { PublicService } from './public.service';
import { QualificationRulesController } from './qualification-rules.controller';
import { QualificationRulesService } from './qualification-rules.service';
import { RatingsService } from './ratings.service';
import { RealtimeService } from './realtime.service';
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
import { StructurePresetsController } from './structure-presets.controller';
import { StructurePresetsService } from './structure-presets.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TimeSlotsController } from './timeslots.controller';
import { TimeSlotsService } from './timeslots.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [OrganizationsModule, PermissionsModule, PaymentsModule, MailModule],
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
    CrossGroupQualificationRulesController,
    StructurePresetsController,
    ScheduleController,
    MatchesController,
    ScoresController,
    StandingsController,
    PublicController,
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
    CrossGroupQualificationRulesService,
    StructurePresetsService,
    ScheduleGenerationService,
    MatchesService,
    RecapRenderService,
    ScoresService,
    StandingsService,
    BracketsService,
    RatingsService,
    PublicService,
    RealtimeService,
  ],
  // TournamentsService/CategoriesService additionally exported for
  // RegistrationsModule (feat/036), which resolves a public tournament by
  // slug and validates a categoryId the same way PublicService already does
  // from inside this module.
  exports: [TournamentPermissionGuard, TournamentsService, CategoriesService],
})
export class TournamentsModule {}
