import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NotificationSettingsService,
} from './notification-settings.service';

const STORAGE_KEY = 'arena-pulse:notification-settings';

describe('NotificationSettingsService', () => {
  function create(): NotificationSettingsService {
    TestBed.resetTestingModule();
    return TestBed.inject(NotificationSettingsService);
  }

  beforeEach(() => localStorage.clear());

  it('starts with everything on, a 15 minute reminder and sound', () => {
    const service = create();

    expect(service.global()).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(service.global()).toMatchObject({
      enabled: true,
      reminder: true,
      reminderMinutes: 15,
      sound: true,
    });
  });

  it('changes the global settings and keeps them across launches', () => {
    const service = create();

    service.setGlobal({ score: false, reminderMinutes: 30 });

    const next = create();
    expect(next.global()).toMatchObject({ score: false, reminderMinutes: 30, started: true });
  });

  it("layers a team's own settings over the global ones", () => {
    const service = create();
    service.setGlobal({ sound: false });

    service.setTeam('coupe', 't1', { result: false });

    expect(service.prefsFor('coupe', 't1')).toMatchObject({ result: false, sound: false });
    expect(service.prefsFor('coupe', 't2')).toMatchObject({ result: true, sound: false });
    expect(service.hasTeamOverride('coupe', 't1')).toBe(true);
    expect(service.hasTeamOverride('coupe', 't2')).toBe(false);
  });

  it('starts a team override from the current global values, so nothing visibly changes', () => {
    const service = create();
    service.setGlobal({ reminderMinutes: 60 });

    service.setTeam('coupe', 't1', {});

    expect(service.prefsFor('coupe', 't1').reminderMinutes).toBe(60);
    // ...but it no longer follows later global changes for the fields it holds.
    service.setGlobal({ reminderMinutes: 5 });
    expect(service.prefsFor('coupe', 't1').reminderMinutes).toBe(60);
  });

  it('goes back to the global settings when the override is cleared', () => {
    const service = create();
    service.setTeam('coupe', 't1', { enabled: false });

    service.clearTeam('coupe', 't1');

    expect(service.hasTeamOverride('coupe', 't1')).toBe(false);
    expect(service.prefsFor('coupe', 't1').enabled).toBe(true);
  });

  it('ignores stored values of the wrong type or outside the allowed delays', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        global: { sound: 'loud', reminderMinutes: 7, score: false },
        teams: { 'a:b': { reminderMinutes: '15', started: false } },
      }),
    );

    const service = create();

    expect(service.global()).toMatchObject({ sound: true, reminderMinutes: 15, score: false });
    expect(service.prefsFor('a', 'b')).toMatchObject({ reminderMinutes: 15, started: false });
  });

  it('falls back to the defaults on unreadable storage', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    expect(create().global()).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });
});
