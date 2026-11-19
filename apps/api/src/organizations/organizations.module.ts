import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { SuperAdminNotificationsModule } from '../super-admin/notifications/super-admin-notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { OrganizationInvitationsController } from './organization-invitations.controller';
import { OrganizationLaunchPromoController } from './organization-launch-promo.controller';
import { OrganizationSubscriptionController } from './organization-subscription.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { MyOrganizationController } from './my-organization.controller';

@Module({
  imports: [
    AuthModule,
    MailModule,
    PaymentsModule,
    SuperAdminNotificationsModule,
  ],
  controllers: [
    MyOrganizationController,
    OrganizationsController,
    OrganizationInvitationsController,
    InvitationsController,
    OrganizationSubscriptionController,
    OrganizationLaunchPromoController,
  ],
  providers: [OrganizationsService, InvitationsService, OrganizationRoleGuard],
  exports: [OrganizationRoleGuard, OrganizationsService],
})
export class OrganizationsModule {}
