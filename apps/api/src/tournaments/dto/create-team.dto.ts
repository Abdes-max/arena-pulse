import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

  /**
   * Club picked from the federation directory (ClubDirectoryService), e.g.
   * "fff:553079" or "siren:453133209" -- an FFF club's crest is then
   * imported as the team logo (premium).
   */
  @IsOptional()
  @Matches(/^(fff:\d{1,10}|siren:\d{9})$/)
  externalClubId?: string;
}
