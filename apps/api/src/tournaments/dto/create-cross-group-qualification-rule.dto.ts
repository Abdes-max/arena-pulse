import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateCrossGroupQualificationRuleDto {
  @IsInt()
  @Min(1)
  position!: number;

  @IsInt()
  @Min(1)
  bestCount!: number;

  @IsUUID()
  targetPhaseId!: string;
}
