import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpdateSponsorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUrl()
  linkUrl?: string;
}
