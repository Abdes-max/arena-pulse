import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateQualificationRuleDto {
  @IsInt()
  @Min(1)
  fromPosition!: number;

  @IsInt()
  @Min(1)
  toPosition!: number;

  @IsUUID()
  targetPhaseId!: string;
}
