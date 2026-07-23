import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Empty string clears the division; omit the field to leave it untouched. */
  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsEmail()
  managerEmail?: string;

  @IsOptional()
  @IsString()
  managerPhone?: string;
}
