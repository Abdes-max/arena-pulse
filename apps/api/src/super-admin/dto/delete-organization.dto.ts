import { IsString } from 'class-validator';

export class DeleteOrganizationDto {
  // Must equal 'SUPPRIMER' (case/whitespace-insensitive) -- see
  // SuperAdminOrganizationsService.deleteOrganizationCascade. Same
  // typed-confirmation gate as the self-deletion flows (feat/171/173),
  // checked server-side too, not just a disabled button client-side.
  @IsString()
  confirmation!: string;
}
