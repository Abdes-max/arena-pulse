import { Module } from '@nestjs/common';
import { MailModule } from '../../mail/mail.module';
import { SuperAdminNotificationService } from './super-admin-notification.service';

// Kept apart from SuperAdminModule (which pulls in the super-admin auth
// guard and every console controller): the services that raise these
// events -- auth, organizations, tournaments, registrations -- only need
// the notifier.
@Module({
  imports: [MailModule],
  providers: [SuperAdminNotificationService],
  exports: [SuperAdminNotificationService],
})
export class SuperAdminNotificationsModule {}
