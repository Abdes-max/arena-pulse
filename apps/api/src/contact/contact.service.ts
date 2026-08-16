import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@Injectable()
export class ContactService {
  constructor(private readonly mailService: MailService) {}

  // Unlike the other MailService calls in this codebase (welcome email,
  // receipts...), sending IS the whole point of this endpoint -- there's no
  // ContactMessage table backing it up, so a failed send must surface as an
  // error to the caller rather than being swallowed (the non-blocking
  // try/catch pattern used elsewhere would silently lose the message).
  async send(dto: CreateContactMessageDto): Promise<void> {
    await this.mailService.sendContactMessage(dto);
  }
}
