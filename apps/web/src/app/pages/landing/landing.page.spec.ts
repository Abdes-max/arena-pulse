import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { LandingPage } from './landing.page';

describe('LandingPage', () => {
  it('links its call-to-action to the admin-web registration page', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a.landing-page__cta');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(`${environment.adminUrl}/register`);
    }
  });
});
