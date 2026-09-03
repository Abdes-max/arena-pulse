import { Module } from '@nestjs/common';
import { RevenueCatService } from './revenuecat.service';
import { StripeService } from './stripe.service';

@Module({
  providers: [StripeService, RevenueCatService],
  exports: [StripeService, RevenueCatService],
})
export class PaymentsModule {}
