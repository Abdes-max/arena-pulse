import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlayerAuthModule } from '../player-auth/player-auth.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PublicRegistrationsController } from './public-registrations.controller';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [
    OrganizationsModule,
    TournamentsModule,
    PaymentsModule,
    PlayerAuthModule,
  ],
  controllers: [
    RegistrationsController,
    PublicRegistrationsController,
    PaymentsWebhookController,
  ],
  providers: [RegistrationsService],
})
export class RegistrationsModule {}
