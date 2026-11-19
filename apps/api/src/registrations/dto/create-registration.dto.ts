import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsInt,
  Max,
  IsOptional,
  IsString,
  Matches,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RegistrationPlayerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  jerseyNumber?: number;
}

export class CreateRegistrationDto {
  /** Team sports only; an individual registration is named after its single player. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  teamName?: string;

  /**
   * Team sports: how many teams to register at once (same club), named
   * "<teamName> 1", "<teamName> 2"... Within the organizer's
   * maxTeamsPerRegistrant, counting the manager's other requests.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  teamCount?: number;

  /** Team sports: club picked from the directory (fff:<n°>, club:<sport>:<slug>, siren:<n°>). */
  @IsOptional()
  @Matches(/^(fff:\d{1,10}|club:[a-z]+:[a-z0-9-]{1,150}|siren:\d{9})$/)
  externalClubId?: string;

  @IsEmail()
  @MaxLength(254)
  managerEmail!: string;

  /** Required: the organizer calls the team manager (or the player) back. */
  @IsString()
  @MinLength(6)
  @MaxLength(30)
  managerPhone!: string;

  /**
   * Individual sports: the single player. Team sports register the team
   * only (name + manager contact) -- the roster is optional.
   */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RegistrationPlayerDto)
  @ArrayMinSize(1)
  players?: RegistrationPlayerDto[];
}
