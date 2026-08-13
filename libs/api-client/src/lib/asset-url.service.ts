import { Injectable, inject } from '@angular/core';
import { resolveAssetUrl } from 'shared-models';
import { API_CLIENT_CONFIG } from './api-client.config';

/**
 * Turns a path the API returned relative to its own origin (e.g. a team's
 * logoUrl, "/uploads/team-logos/x.png") into a URL fetchable from wherever
 * this app is actually running -- see resolveAssetUrl for why that differs
 * between web (relative apiUrl in production, a no-op here) and mobile
 * (apiUrl is an absolute, different-origin URL there).
 */
@Injectable({ providedIn: 'root' })
export class AssetUrlService {
  private readonly config = inject(API_CLIENT_CONFIG);

  resolve(path: string | null | undefined): string | null {
    return resolveAssetUrl(path ?? null, this.config.apiUrl);
  }
}
