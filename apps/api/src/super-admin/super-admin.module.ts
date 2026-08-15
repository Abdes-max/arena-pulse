import { Module } from '@nestjs/common';
import { SuperAdminAuthModule } from '../super-admin-auth/super-admin-auth.module';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';
import { SuperAdminOrganizationsController } from './super-admin-organizations.controller';
import { SuperAdminOrganizationsService } from './super-admin-organizations.service';
import { SuperAdminPaymentsController } from './super-admin-payments.controller';
import { SuperAdminPaymentsService } from './super-admin-payments.service';
import { SuperAdminStatsController } from './super-admin-stats.controller';
import { SuperAdminStatsService } from './super-admin-stats.service';
import { SuperAdminTournamentsController } from './super-admin-tournaments.controller';
import { SuperAdminTournamentsService } from './super-admin-tournaments.service';
import { SuperAdminUsersController } from './super-admin-users.controller';
import { SuperAdminUsersService } from './super-admin-users.service';

@Module({
  // SuperAdminAuthModule exports SuperAdminJwtAuthGuard, used locally
  // (@UseGuards) on every controller below.
  imports: [SuperAdminAuthModule],
  controllers: [
    SuperAdminStatsController,
    SuperAdminOrganizationsController,
    SuperAdminUsersController,
    SuperAdminTournamentsController,
    SuperAdminPaymentsController,
  ],
  providers: [
    SuperAdminAuditLogService,
    SuperAdminStatsService,
    SuperAdminOrganizationsService,
    SuperAdminUsersService,
    SuperAdminTournamentsService,
    SuperAdminPaymentsService,
  ],
})
export class SuperAdminModule {}
