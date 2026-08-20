import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
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
