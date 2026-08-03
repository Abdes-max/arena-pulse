import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StripeService } from '../payments/stripe.service';
import { RegistrationsService } from './registrations.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly registrationsService: RegistrationsService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Requête webhook invalide.');
    }

    const event = (() => {
      try {
        return this.stripeService.constructWebhookEvent(req.rawBody, signature);
      } catch {
        throw new BadRequestException('Signature de webhook invalide.');
      }
    })();

    await this.registrationsService.handleStripeEvent(event);
    return { received: true };
  }
}
