import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Applied locally (@UseGuards) on super-admin routes only -- unlike the
 * organizer JwtAuthGuard, this is not a global APP_GUARD. Those routes are
 * still marked @Public() to bypass the global organizer guard first.
 */
@Injectable()
export class SuperAdminJwtAuthGuard extends AuthGuard('super-admin-jwt') {}
