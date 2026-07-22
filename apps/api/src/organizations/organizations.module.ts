import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { OrganizationInvitationsController } from './organization-invitations.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationRoleGuard } from './guards/organization-role.guard';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [
    OrganizationsController,
    OrganizationInvitationsController,
    InvitationsController,
  ],
  providers: [OrganizationsService, InvitationsService, OrganizationRoleGuard],
})
export class OrganizationsModule {}
