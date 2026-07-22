import { IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Fields are only required when the invited email has no existing account
 * yet (anonymous accept path) — enforced in InvitationsService rather than
 * here, since the requirement depends on server-side state (does a User
 * with this email already exist), not on the shape of the payload alone.
 */
export class AcceptInvitationDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;
}
