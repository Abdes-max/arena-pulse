import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedSuperAdmin } from '../strategies/super-admin-jwt.strategy';

export const CurrentSuperAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedSuperAdmin => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedSuperAdmin }>();
    return request.user;
  },
);
