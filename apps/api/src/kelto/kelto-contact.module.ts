import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { KeltoContactController } from './kelto-contact.controller';
import { KeltoContactService } from './kelto-contact.service';

@Module({
  imports: [MailModule],
  controllers: [KeltoContactController],
  providers: [KeltoContactService],
})
export class KeltoContactModule {}
