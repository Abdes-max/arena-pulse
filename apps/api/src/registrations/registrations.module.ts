import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlayerAuthModule } from '../player-auth/player-auth.module';
import { SuperAdminNotificationsModule } from '../super-admin/notifications/super-admin-notifications.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PublicRegistrationInfoController } from './public-registration-info.controller';
import { PublicRegistrationsController } from './public-registrations.controller';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [
    MailModule,
    OrganizationsModule,
    TournamentsModule,
    PaymentsModule,
    PlayerAuthModule,
    SuperAdminNotificationsModule,
  ],
  controllers: [
    RegistrationsController,
    PublicRegistrationsController,
    PublicRegistrationInfoController,
    PaymentsWebhookController,
  ],
  providers: [RegistrationsService],
})
export class RegistrationsModule {}
