import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

// Routes that carry a single-use secret token as a URL path segment
// (email-verification links, invitation links) -- these end up in browser
// history, proxy access logs, and now our own app logs, all as plain text
// unless redacted. `[^/?]+` grabs exactly the token segment and stops at
// the next `/` (e.g. the `/accept` suffix on invitation-accept) or `?`.
const TOKEN_URL_PATTERNS: RegExp[] = [
  /(\/auth\/verify-email\/)[^/?]+/,
  /(\/invitations\/)[^/?]+/,
];

function redactSensitiveTokens(url: string): string {
  return TOKEN_URL_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, '$1[REDACTED]'),
    url,
  );
}

/**
 * Logs one line per request (method, path, status, duration, requestId).
 * Skips the health-check endpoint by default -- an orchestrator polling it
 * every few seconds would otherwise drown out real traffic in the logs.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    if (request.path.endsWith('/health')) {
      return next.handle();
    }

    const { method, originalUrl, requestId } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.log(method, originalUrl, response.statusCode, start, requestId),
        error: (error: unknown) =>
          this.log(
            method,
            originalUrl,
            this.statusFromError(error),
            start,
            requestId,
          ),
      }),
    );
  }

  private statusFromError(error: unknown): number {
    const status = (error as { status?: number; getStatus?: () => number })
      ?.status;
    if (typeof status === 'number') {
      return status;
    }
    const getStatus = (error as { getStatus?: () => number })?.getStatus;
    return typeof getStatus === 'function' ? getStatus() : 500;
  }

  private log(
    method: string,
    url: string,
    statusCode: number,
    start: number,
    requestId: string,
  ): void {
    const durationMs = Date.now() - start;
    const safeUrl = redactSensitiveTokens(url);
    this.logger.log({
      message: `${method} ${safeUrl} ${statusCode} ${durationMs}ms`,
      method,
      url: safeUrl,
      statusCode,
      durationMs,
      requestId,
    });
  }
}
