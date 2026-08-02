import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Catches everything so every error is logged server-side with a stack
 * trace and requestId, even ones Nest's own default handler would otherwise
 * log as an unstructured console line. Existing HttpException response
 * bodies (status + shape, e.g. class-validator's { message: string[] } from
 * ValidationPipe) are passed through unchanged -- only a `requestId` field
 * is added -- so no frontend error handling written before this filter
 * existed breaks. Only a genuinely unhandled (non-HttpException) error gets
 * its message replaced, to avoid leaking internals in the 500 response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId;

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException
      ? this.withRequestId(exception.getResponse(), requestId)
      : {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erreur interne du serveur.',
          requestId,
        };

    this.log(exception, status, request, requestId);
    response.status(status).json(body);
  }

  private withRequestId(
    body: unknown,
    requestId: string,
  ): Record<string, unknown> {
    return typeof body === 'object' && body !== null
      ? { ...(body as Record<string, unknown>), requestId }
      : { message: body, requestId };
  }

  private log(
    exception: unknown,
    status: number,
    request: Request,
    requestId: string,
  ): void {
    const message =
      exception instanceof Error ? exception.message : 'Erreur inconnue';
    const stack = exception instanceof Error ? exception.stack : undefined;
    const meta = {
      message,
      method: request.method,
      url: request.originalUrl,
      statusCode: status,
      requestId,
    };
    if (status >= 500) {
      this.logger.error(meta, stack);
    } else {
      this.logger.warn(meta);
    }
  }
}
