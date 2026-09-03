import { IsIn } from 'class-validator';
import { IAP_PRODUCT_IDS } from '../../payments/revenuecat.service';

const TOURNAMENT_TIER_PRODUCT_IDS = [
  IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_STANDARD,
  IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_LARGE,
  IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_UPGRADE_STANDARD_TO_LARGE,
] as const;

export class ConfirmIapPurchaseDto {
  @IsIn(TOURNAMENT_TIER_PRODUCT_IDS)
  productId!: (typeof TOURNAMENT_TIER_PRODUCT_IDS)[number];
}
