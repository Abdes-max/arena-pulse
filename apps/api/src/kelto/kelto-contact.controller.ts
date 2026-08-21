import { Body, Controller, HttpStatus, Post, Redirect } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { KeltoContactService } from './kelto-contact.service';

// Same posture as ContactController's CONTACT_THROTTLE: sized against
// abuse (spamming an inbox), well below the app-wide default. Relaxed
// under Jest for the same reason -- see app.module.ts.
const KELTO_CONTACT_THROTTLE = {
  default: {
    limit: process.env.NODE_ENV === 'test' ? 100_000 : 5,
    ttl: 60_000,
  },
};

// Not documented in the public Swagger UI -- this exists purely to be the
// target of a <form> on kelto-studio.fr, a different product's marketing
// site, not part of the TournArena API surface consumers integrate against.
@ApiExcludeController()
@Controller('kelto/contact')
export class KeltoContactController {
  constructor(private readonly keltoContactService: KeltoContactService) {}

  // @Redirect (not @Res()) keeps this on Nest's normal response pipeline --
  // the handler just returns where the browser goes next, exactly like any
  // other endpoint returning a normal payload.
  @Public()
  @Throttle(KELTO_CONTACT_THROTTLE)
  @Post()
  @Redirect()
  async send(
    @Body() body: Record<string, unknown>,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.keltoContactService.handleSubmission(body);
    return { url, statusCode: HttpStatus.SEE_OTHER };
  }
}
