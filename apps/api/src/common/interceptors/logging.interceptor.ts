import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

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
    this.logger.log({
      message: `${method} ${url} ${statusCode} ${durationMs}ms`,
      method,
      url,
      statusCode,
      durationMs,
      requestId,
    });
  }
}
