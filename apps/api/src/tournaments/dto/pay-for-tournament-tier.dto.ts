import { IsIn } from 'class-validator';

export class PayForTournamentTierDto {
  @IsIn(['STANDARD', 'LARGE'])
  tier!: 'STANDARD' | 'LARGE';
}
