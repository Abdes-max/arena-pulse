import { describe, expect, it } from 'vitest';
import { isSafeReturnUrl } from './safe-return-url.util';

describe('isSafeReturnUrl', () => {
  it('accepts a normal in-app path', () => {
    expect(isSafeReturnUrl('/admin/tournaments')).toBe(true);
  });

  it('accepts a path with a trailing query string', () => {
    expect(isSafeReturnUrl('/admin/tournaments?tab=teams')).toBe(true);
  });

  it('rejects a protocol-relative URL', () => {
    expect(isSafeReturnUrl('//evil.com')).toBe(false);
  });

  it('rejects an absolute https URL', () => {
    expect(isSafeReturnUrl('https://evil.com')).toBe(false);
  });

  it('rejects an absolute http URL', () => {
    expect(isSafeReturnUrl('http://evil.com/phishing')).toBe(false);
  });

  it('rejects the backslash variant some browsers normalize to //', () => {
    expect(isSafeReturnUrl('/\\evil.com')).toBe(false);
  });

  it('rejects a path with no leading slash', () => {
    expect(isSafeReturnUrl('admin/tournaments')).toBe(false);
  });

  it('rejects null, undefined, and empty string', () => {
    expect(isSafeReturnUrl(null)).toBe(false);
    expect(isSafeReturnUrl(undefined)).toBe(false);
    expect(isSafeReturnUrl('')).toBe(false);
  });
});
