import { IsString, MaxLength } from 'class-validator';

export class DeleteSuperAdminAccountDto {
  // Must equal 'SUPPRIMER' (case/whitespace-insensitive) -- see
  // SuperAdminAuthService.deleteAccount. Same replacement as
  // auth/dto/delete-account.dto.ts.
  @IsString()
  @MaxLength(50)
  confirmation!: string;
}
