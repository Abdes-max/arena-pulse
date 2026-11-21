import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { RobotsMetaService } from './robots-meta.service';

describe('RobotsMetaService', () => {
  const robotsTag = () => TestBed.inject(DOCUMENT).head.querySelector('meta[name="robots"]');

  it('adds then removes the noindex robots tag', () => {
    const service = TestBed.inject(RobotsMetaService);

    service.setNoIndex(true);
    expect(robotsTag()?.getAttribute('content')).toBe('noindex');

    service.setNoIndex(false);
    expect(robotsTag()).toBeNull();
  });
});
