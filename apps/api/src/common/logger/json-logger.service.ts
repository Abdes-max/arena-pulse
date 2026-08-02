import { LoggerService, LogLevel } from '@nestjs/common';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message?: string;
  context?: string;
  trace?: string;
  [key: string]: unknown;
}

/**
 * Structured logger: one JSON object per line on stdout (stderr for
 * error/fatal) -- no external dependency (pino/winston) at this stage, see
 * docs/architecture/adr/0003-observability-strategy.md. Matches Nest's own
 * ConsoleLogger call shape (message, context) / (message, trace, context) so
 * it's a drop-in replacement for the framework's own internal bootstrap
 * logs, passed to NestFactory.create(AppModule, { logger: new JsonLogger() }).
 */
export class JsonLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write('log', message, undefined, context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.write('error', message, trace, context);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, undefined, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, undefined, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, undefined, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, undefined, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    trace?: string,
    context?: string,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
    };
    // A plain object message (e.g. from LoggingInterceptor) is spread
    // directly into the entry -- e.g. { message: 'HTTP request', method,
    // url, statusCode } -- rather than JSON-double-encoded into a single
    // `message` string, so fields stay individually filterable/queryable.
    if (typeof message === 'string') {
      entry.message = message;
    } else if (message && typeof message === 'object') {
      Object.assign(entry, message);
    } else {
      entry.message = String(message);
    }
    if (context) {
      entry.context = context;
    }
    if (trace) {
      entry.trace = trace;
    }
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}
