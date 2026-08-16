import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { ContactService } from './contact.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

// Same posture as auth.controller.ts's AUTH_THROTTLE: well below the
// app-wide default (100/min, see app.module.ts), sized against abuse
// (spamming an inbox) rather than credential-stuffing. Relaxed under Jest
// for the same reason as AUTH_THROTTLE -- see app.module.ts.
const CONTACT_THROTTLE = {
  default: {
    limit: process.env.NODE_ENV === 'test' ? 100_000 : 5,
    ttl: 60_000,
  },
};

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Throttle(CONTACT_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  async send(@Body() dto: CreateContactMessageDto): Promise<void> {
    await this.contactService.send(dto);
  }
}
