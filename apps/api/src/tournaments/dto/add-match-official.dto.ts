import { IsOptional, IsUUID } from 'class-validator';

export class AddMatchOfficialDto {
  @IsOptional()
  @IsUUID()
  refereeId?: string;

  @IsOptional()
  @IsUUID()
  refereeingTeamId?: string;
}
