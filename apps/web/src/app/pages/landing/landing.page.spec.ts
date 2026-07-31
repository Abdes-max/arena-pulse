import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { LandingPage } from './landing.page';

describe('LandingPage', () => {
  it('links its call-to-action to the registration page', async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('a.landing-page__cta');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe('/register');
    }
  });

  it('links "Se connecter" to the login page', async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter([])] }).compileComponents();
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.landing-page__nav-login');
    expect(link.getAttribute('href')).toBe('/login');
  });
});
