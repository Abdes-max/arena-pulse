import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Used on routes that behave differently for anonymous vs. authenticated
 * callers (e.g. accepting an invitation) — never throws on a missing/invalid
 * token, just leaves `request.user` unset.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser | null {
    return user ?? null;
  }
}
