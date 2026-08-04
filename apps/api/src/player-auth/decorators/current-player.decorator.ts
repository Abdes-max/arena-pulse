import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedPlayer } from '../strategies/player-jwt.strategy';

export const CurrentPlayer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPlayer => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedPlayer }>();
    return request.user;
  },
);
