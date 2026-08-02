import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalErrorHandler } from './global-error-handler';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    handler = new GlobalErrorHandler();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('logs a structured entry with the error message and stack for a real Error', () => {
    handler.handleError(new Error('boom'));

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const entry = consoleErrorSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(entry['level']).toBe('error');
    expect(entry['message']).toBe('boom');
    expect(typeof entry['stack']).toBe('string');
    expect(typeof entry['timestamp']).toBe('string');
    expect(typeof entry['url']).toBe('string');
  });

  it('still logs a message for a non-Error thrown value, without a stack', () => {
    handler.handleError('a plain string error');

    const entry = consoleErrorSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(entry['message']).toBe('a plain string error');
    expect(entry['stack']).toBeUndefined();
  });
});
