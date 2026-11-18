import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

  /**
   * Club picked from the federation directory (ClubDirectoryService), e.g.
   * "fff:553079" or "siren:453133209" -- an FFF club's crest is then
   * imported as the team logo (every plan). Empty string unlinks the club.
   */
  @IsOptional()
  @Matches(/^(fff:\d{1,10}|siren:\d{9})?$/)
  externalClubId?: string;
}
