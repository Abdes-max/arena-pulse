import { TestBed } from '@angular/core/testing';
import { AssetUrlService } from './asset-url.service';
import { provideApiClient } from './api-client.config';

describe('AssetUrlService', () => {
  function serviceWithApiUrl(apiUrl: string): AssetUrlService {
    TestBed.configureTestingModule({ providers: [provideApiClient({ apiUrl })] });
    return TestBed.inject(AssetUrlService);
  }

  it('returns null for a null/undefined path', () => {
    const service = serviceWithApiUrl('https://tournarena.com/api/v1');
    expect(service.resolve(null)).toBeNull();
    expect(service.resolve(undefined)).toBeNull();
  });

  it('stays relative for a relative apiUrl (web production)', () => {
    const service = serviceWithApiUrl('/api/v1');
    expect(service.resolve('/uploads/team-logos/x.png')).toBe('/uploads/team-logos/x.png');
  });

  it('prepends the origin for an absolute apiUrl (mobile)', () => {
    const service = serviceWithApiUrl('https://tournarena.com/api/v1');
    expect(service.resolve('/uploads/team-logos/x.png')).toBe(
      'https://tournarena.com/uploads/team-logos/x.png',
    );
  });
});
