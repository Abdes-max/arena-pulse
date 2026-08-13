import { resolveAssetUrl } from './asset-url.util';

describe('resolveAssetUrl', () => {
  it('returns null for a null path', () => {
    expect(resolveAssetUrl(null, 'https://tournarena.com/api/v1')).toBeNull();
  });

  it('stays relative when apiUrl is itself relative (web production)', () => {
    expect(resolveAssetUrl('/uploads/team-logos/x.png', '/api/v1')).toBe(
      '/uploads/team-logos/x.png',
    );
  });

  it('prepends the origin when apiUrl is absolute (mobile)', () => {
    expect(resolveAssetUrl('/uploads/team-logos/x.png', 'https://tournarena.com/api/v1')).toBe(
      'https://tournarena.com/uploads/team-logos/x.png',
    );
  });

  it('prepends a local dev origin the same way', () => {
    expect(resolveAssetUrl('/uploads/team-logos/x.png', 'http://localhost:3000/api/v1')).toBe(
      'http://localhost:3000/uploads/team-logos/x.png',
    );
  });
});
