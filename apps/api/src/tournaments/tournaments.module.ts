import { Module } from '@nestjs/common';
import { ClubDirectoryModule } from '../club-directory/club-directory.module';
import { MailModule } from '../mail/mail.module';
import { SuperAdminNotificationsModule } from '../super-admin/notifications/super-admin-notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PaymentsModule } from '../payments/payments.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RecapRenderService } from '../recap/recap-render.service';
import { BracketsService } from './brackets.service';
import { PhaseScoresService } from './phase-scores.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { DashboardStatsController } from './dashboard-stats.controller';
import { DashboardStatsService } from './dashboard-stats.service';
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
import { QuickPlateauController } from './quick-plateau.controller';
import { QuickPlateauService } from './quick-plateau.service';
import { ScheduleGenerationService } from './schedule-generation.service';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { SponsorsController } from './sponsors.controller';
import { SponsorsService } from './sponsors.service';
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
import { WrappedService } from './wrapped.service';

@Module({
  imports: [
    OrganizationsModule,
    PermissionsModule,
    PaymentsModule,
    MailModule,
    SuperAdminNotificationsModule,
    ClubDirectoryModule,
  ],
  controllers: [
    TournamentsController,
    CategoriesController,
    DivisionsController,
    TournamentAdministratorsController,
    TeamsController,
    PlayersController,
    VenuesController,
    SponsorsController,
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
    QuickPlateauController,
    MatchesController,
    ScoresController,
    StandingsController,
    PublicController,
    DashboardStatsController,
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
    SponsorsService,
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
    QuickPlateauService,
    MatchesService,
    RecapRenderService,
    ScoresService,
    StandingsService,
    BracketsService,
    PhaseScoresService,
    RatingsService,
    PublicService,
    RealtimeService,
    WrappedService,
    DashboardStatsService,
  ],
  // TournamentsService/CategoriesService additionally exported for
  // RegistrationsModule (feat/036), which resolves a public tournament by
  // slug and validates a categoryId the same way PublicService already does
  // from inside this module.
  exports: [TournamentPermissionGuard, TournamentsService, CategoriesService],
})
export class TournamentsModule {}
