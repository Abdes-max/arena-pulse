import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

/**
 * Assigns a per-request correlation id -- reused from an incoming
 * x-request-id header when a reverse proxy/load balancer already set one,
 * otherwise generated here. Echoed back on the response so a client can
 * quote it when reporting an issue, and read by LoggingInterceptor /
 * AllExceptionsFilter so every log line for a request can be grep'd together.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(REQUEST_ID_HEADER);
    req.requestId =
      incoming && incoming.trim().length > 0 ? incoming : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, req.requestId);
    next();
  }
}
