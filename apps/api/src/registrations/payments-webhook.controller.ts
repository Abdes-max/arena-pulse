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
import { OrganizationsService } from '../organizations/organizations.service';
import { StripeService } from '../payments/stripe.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { RegistrationsService } from './registrations.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly registrationsService: RegistrationsService,
    private readonly tournamentsService: TournamentsService,
    private readonly organizationsService: OrganizationsService,
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

    // Three independent, idempotent handlers rather than a metadata-based
    // dispatcher: each looks up its own row by stripeCheckoutSessionId and
    // no-ops if it doesn't own this session (see
    // docs/architecture/adr/0006-paid-tournament-publication.md).
    await this.registrationsService.handleStripeEvent(event);
    await this.tournamentsService.handlePublicationStripeEvent(event);
    await this.organizationsService.handleSubscriptionStripeEvent(event);
    return { received: true };
  }
}
