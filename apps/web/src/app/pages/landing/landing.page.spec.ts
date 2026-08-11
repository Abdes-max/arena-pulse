import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideApiClient } from 'api-client';
import { LandingPage } from './landing.page';

// LandingPage now fetches the published-tournaments list on construction
// (PublicApiService) -- provideHttpClientTesting keeps that a captured,
// never-flushed request rather than a real network call these tests would
// otherwise flake on.
function configureTestBed() {
  return TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideApiClient({ apiUrl: 'http://localhost/api/v1' }),
    ],
  }).compileComponents();
}

describe('LandingPage', () => {
  it('links its call-to-action to the registration page', async () => {
    await configureTestBed();
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a.landing-page__cta');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/register');
    }
  });

  it('links "Se connecter" to the login page', async () => {
    await configureTestBed();
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.landing-page__nav-login');
    expect(link.getAttribute('href')).toBe('/login');
  });
});
