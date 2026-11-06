import { IsEnum } from 'class-validator';
import { AdminUiMode } from '../../../generated/prisma/client';

export class UpdatePreferencesDto {
  @IsEnum(AdminUiMode)
  adminUiMode!: AdminUiMode;
}
