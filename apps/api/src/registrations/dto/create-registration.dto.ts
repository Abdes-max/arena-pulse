import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
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
