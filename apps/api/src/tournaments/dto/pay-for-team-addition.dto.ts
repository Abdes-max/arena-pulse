import { IsInt, Min } from 'class-validator';

export class PayForTeamAdditionDto {
  @IsInt()
  @Min(1)
  additionalTeams!: number;
}
