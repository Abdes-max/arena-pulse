import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class CreateSponsorDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsUrl()
  linkUrl?: string;
}
