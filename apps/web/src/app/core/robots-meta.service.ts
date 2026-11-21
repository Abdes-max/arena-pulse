import { Injectable, inject } from '@angular/core';
import { Meta } from '@angular/platform-browser';

/**
 * Toggles <meta name="robots" content="noindex"> on pages that answer
 * "not found" -- nginx serves index.html with a 200 for every SPA path, so
 * without it Google indexes those pages as "Soft 404". Googlebot renders
 * JavaScript and honours a noindex added at runtime.
 */
@Injectable({ providedIn: 'root' })
export class RobotsMetaService {
  private readonly meta = inject(Meta);

  setNoIndex(noIndex: boolean): void {
    if (noIndex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    } else {
      this.meta.removeTag('name="robots"');
    }
  }
}
