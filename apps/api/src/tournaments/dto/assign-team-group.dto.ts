import { IsUUID, ValidateIf } from 'class-validator';

export class AssignTeamGroupDto {
  @ValidateIf((dto: AssignTeamGroupDto) => dto.groupId !== null)
  @IsUUID()
  groupId!: string | null;
}
