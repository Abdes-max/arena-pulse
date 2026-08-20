import { Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

// Audit finding (securite-audit.md): single-use secret tokens
// (email-verification links, invitation links) used to end up in plain
// text in every request log line -- these tests pin the redaction so it
// can't silently regress.
describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function contextFor(
    originalUrl: string,
    path = originalUrl,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          originalUrl,
          path,
          requestId: 'req-1',
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
  }

  function handlerReturning(value: unknown = {}): CallHandler {
    return { handle: () => of(value) };
  }

  it('redacts the token segment of an invitation-accept URL before logging', (done) => {
    const context = contextFor('/api/v1/invitations/abc123secret/accept');
    interceptor.intercept(context, handlerReturning()).subscribe(() => {
      const [entry] = logSpy.mock.calls[0] as [
        { url: string; message: string },
      ];
      expect(entry.url).toBe('/api/v1/invitations/[REDACTED]/accept');
      expect(entry.message).not.toContain('abc123secret');
      done();
    });
  });

  it('redacts an email-verification token', (done) => {
    const context = contextFor('/api/v1/auth/verify-email/xyz789secret');
    interceptor.intercept(context, handlerReturning()).subscribe(() => {
      const [entry] = logSpy.mock.calls[0] as [{ url: string }];
      expect(entry.url).toBe('/api/v1/auth/verify-email/[REDACTED]');
      done();
    });
  });

  it('leaves unrelated URLs untouched', (done) => {
    const context = contextFor('/api/v1/tournaments/tour-1');
    interceptor.intercept(context, handlerReturning()).subscribe(() => {
      const [entry] = logSpy.mock.calls[0] as [{ url: string }];
      expect(entry.url).toBe('/api/v1/tournaments/tour-1');
      done();
    });
  });

  it('skips logging entirely for the health-check endpoint', () => {
    const context = contextFor('/api/v1/health', '/api/v1/health');
    const handler = handlerReturning();
    const handleSpy = jest.spyOn(handler, 'handle');
    interceptor.intercept(context, handler);
    expect(handleSpy).toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('redacts the token even when the request ends in an error', (done) => {
    const context = contextFor('/api/v1/invitations/abc123secret/accept');
    const handler: CallHandler = {
      handle: () => throwError(() => ({ status: 404 })),
    };
    interceptor.intercept(context, handler).subscribe({
      error: () => {
        const [entry] = logSpy.mock.calls[0] as [
          { url: string; statusCode: number },
        ];
        expect(entry.url).toBe('/api/v1/invitations/[REDACTED]/accept');
        expect(entry.statusCode).toBe(404);
        done();
      },
    });
  });
});
