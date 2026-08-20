import { IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  // Must equal 'SUPPRIMER' (case/whitespace-insensitive) -- see
  // AuthService.deleteAccount. Replaces password re-entry (feat/171) with a
  // typed confirmation, same pattern used everywhere else a destructive
  // super-admin/organizer action needs a deliberate, hard-to-mis-click gate.
  @IsString()
  @MaxLength(50)
  confirmation!: string;
}
