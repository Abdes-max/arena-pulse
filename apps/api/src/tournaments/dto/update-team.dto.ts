import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Empty string clears the division; omit the field to leave it untouched. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  divisionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  managerName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  managerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  managerPhone?: string;
}
