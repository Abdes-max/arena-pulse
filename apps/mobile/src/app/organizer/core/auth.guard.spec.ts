import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { organizerAuthGuard, organizerGuestGuard } from './auth.guard';
import { OrganizerAuthService } from './auth.service';

function setup(authenticated: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: OrganizerAuthService, useValue: { isAuthenticated: signal(authenticated) } },
    ],
  });
}

const run = (guard: typeof organizerGuestGuard, url = '/organizer/tournaments') =>
  TestBed.runInInjectionContext(() => guard({} as never, { url } as RouterStateSnapshot)) as
    boolean | UrlTree;

describe('organizerGuestGuard', () => {
  it('lets a signed-out visitor reach the login page', () => {
    setup(false);
    expect(run(organizerGuestGuard)).toBe(true);
  });

  it('sends an already signed-in organizer to their tournaments', () => {
    setup(true);
    const result = run(organizerGuestGuard) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/organizer/tournaments');
  });
});

describe('organizerAuthGuard', () => {
  it('sends a signed-out visitor to login, remembering where they were going', () => {
    setup(false);
    const result = run(organizerAuthGuard, '/organizer/account') as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe(
      '/organizer/login?returnUrl=%2Forganizer%2Faccount',
    );
  });
});
