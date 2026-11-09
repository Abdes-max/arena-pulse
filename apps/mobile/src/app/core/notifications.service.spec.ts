import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import { PublicApiService } from 'api-client';
import { Match, PublicTeamDetail } from 'shared-models';
import { FavoriteTeam } from './favorites.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsService } from './notifications.service';

const {
  scheduleMock,
  requestPermissionsMock,
  checkPermissionsMock,
  getPendingMock,
  cancelMock,
  createChannelMock,
  addListenerMock,
} = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  requestPermissionsMock: vi.fn(),
  checkPermissionsMock: vi.fn(),
  getPendingMock: vi.fn(),
  cancelMock: vi.fn(),
  createChannelMock: vi.fn(),
  addListenerMock: vi.fn(),
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: scheduleMock,
    requestPermissions: requestPermissionsMock,
    checkPermissions: checkPermissionsMock,
    getPending: getPendingMock,
    cancel: cancelMock,
    createChannel: createChannelMock,
    addListener: addListenerMock,
  },
}));

const HOUR = 3_600_000;

function buildMatch(overrides: Partial<Match>): Match {
  return {
    id: 'match-1',
    groupId: null,
    knockoutBracketId: null,
    bracketSlot: null,
    isThirdPlaceMatch: false,
    round: 1,
    status: 'SCHEDULED',
    homeTeam: { id: 't1', name: 'Les Aigles', logoUrl: null },
    awayTeam: { id: 't2', name: 'Les Loups', logoUrl: null },
    homeSourceLabel: null,
    awaySourceLabel: null,
    forfeitedTeam: null,
    timeSlot: null,
    officials: [],
    score: null,
    ...overrides,
  };
}

function inHours(hours: number): Match['timeSlot'] {
  const start = new Date(Date.now() + hours * HOUR);
  return {
    id: 'slot-1',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + HOUR).toISOString(),
    field: { id: 'f1', name: 'Terrain 2' },
  };
}

function liveScore(home: number, away: number): Match['score'] {
  return {
    homeScore: home,
    awayScore: away,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    isValidated: false,
    validatedAt: null,
  };
}

function buildTeamDetail(matches: Match[]): PublicTeamDetail {
  return {
    id: 't1',
    name: 'Les Aigles',
    categoryId: 'c1',
    categoryName: 'Seniors',
    divisionId: null,
    divisionName: null,
    groupId: null,
    groupName: null,
    logoUrl: null,
    position: 1,
    matches: matches.map((match) => ({ ...match, knockoutTotalRounds: null })),
    standing: null,
  };
}

const FAVORITE: FavoriteTeam = {
  tournamentSlug: 'coupe-a1b2',
  teamId: 't1',
  teamName: 'Les Aigles',
};

describe('NotificationsService', () => {
  let getTeam: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let settings: NotificationSettingsService;
  let service: NotificationsService;

  beforeEach(() => {
    localStorage.clear();
    for (const mock of [
      scheduleMock,
      requestPermissionsMock,
      checkPermissionsMock,
      getPendingMock,
      cancelMock,
      createChannelMock,
      addListenerMock,
    ]) {
      mock.mockReset();
    }
    getPendingMock.mockResolvedValue({ notifications: [] });
    addListenerMock.mockResolvedValue({ remove: vi.fn() });
    getTeam = vi.fn();
    navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { fr: {} },
          translocoConfig: { availableLangs: ['fr'], defaultLang: 'fr' },
        }),
      ],
      providers: [
        { provide: PublicApiService, useValue: { getTeam } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    settings = TestBed.inject(NotificationSettingsService);
    service = TestBed.inject(NotificationsService);
  });

  describe('live alerts', () => {
    it('does not notify on the first sighting of a match (establishes the baseline)', async () => {
      getTeam.mockResolvedValue(buildTeamDetail([buildMatch({ status: 'LIVE' })]));

      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      expect(scheduleMock).not.toHaveBeenCalled();
    });

    it('notifies when a tracked match transitions to LIVE', async () => {
      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'SCHEDULED' })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'LIVE' })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      expect(scheduleMock).toHaveBeenCalledTimes(1);
      const body = scheduleMock.mock.calls[0][0].notifications[0].body as string;
      expect(body).toContain('Les Aigles');
      expect(body).toContain('commencé');
    });

    it('notifies with the score when a tracked match gets a new score', async () => {
      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'LIVE', score: null })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      getTeam.mockResolvedValueOnce(
        buildTeamDetail([buildMatch({ status: 'LIVE', score: liveScore(1, 0) })]),
      );
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      expect(scheduleMock).toHaveBeenCalledTimes(1);
      const body = scheduleMock.mock.calls[0][0].notifications[0].body as string;
      expect(body).toBe('Les Aigles 1 - 0 Les Loups');
    });

    it('notifies the final result when a match completes', async () => {
      getTeam.mockResolvedValueOnce(
        buildTeamDetail([buildMatch({ status: 'LIVE', score: liveScore(2, 1) })]),
      );
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      getTeam.mockResolvedValueOnce(
        buildTeamDetail([buildMatch({ status: 'COMPLETED', score: liveScore(2, 1) })]),
      );
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      expect(scheduleMock).toHaveBeenCalledTimes(1);
      expect(scheduleMock.mock.calls[0][0].notifications[0].body).toBe(
        'Match terminé : Les Aigles 2 - 1 Les Loups',
      );
    });

    it('does not notify again when nothing changed between checks', async () => {
      getTeam.mockResolvedValue(buildTeamDetail([buildMatch({ status: 'LIVE' })]));

      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      expect(scheduleMock).not.toHaveBeenCalled();
    });

    it('stays quiet for an alert type the user turned off', async () => {
      settings.setGlobal({ score: false });
      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'LIVE', score: null })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      getTeam.mockResolvedValueOnce(
        buildTeamDetail([buildMatch({ status: 'LIVE', score: liveScore(1, 0) })]),
      );
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      expect(scheduleMock).not.toHaveBeenCalled();
    });

    it("uses a team's own settings over the global ones", async () => {
      settings.setGlobal({ started: true });
      settings.setTeam('coupe-a1b2', 't1', { enabled: false });
      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'SCHEDULED' })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'LIVE' })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      expect(scheduleMock).not.toHaveBeenCalled();
    });

    it('plays the default sound on the alerts channel, or none on the silent one', async () => {
      // Establish a baseline, then flip to LIVE for the same match id.
      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'SCHEDULED' })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);
      getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'LIVE' })]));
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      const withSound = scheduleMock.mock.calls[0][0].notifications[0];
      expect(withSound.sound).toBe('default');
      expect(withSound.channelId).toBe('tournarena-alerts');

      scheduleMock.mockClear();
      settings.setGlobal({ sound: false });
      getTeam.mockResolvedValueOnce(
        buildTeamDetail([buildMatch({ status: 'LIVE', score: liveScore(1, 0) })]),
      );
      await service.checkFavoriteUpdates('coupe-a1b2', [FAVORITE]);

      const silent = scheduleMock.mock.calls[0][0].notifications[0];
      expect(silent.sound).toBeUndefined();
      expect(silent.channelId).toBe('tournarena-silent');
    });
  });

  describe('reminders', () => {
    it('schedules a reminder N minutes before a match, with the field and its own ID', async () => {
      getTeam.mockResolvedValue(
        buildTeamDetail([buildMatch({ id: 'm-upcoming', timeSlot: inHours(2) })]),
      );

      await service.syncReminders([FAVORITE]);

      expect(scheduleMock).toHaveBeenCalledTimes(1);
      const [reminder] = scheduleMock.mock.calls[0][0].notifications;
      const expectedAt = new Date(inHours(2)!.startTime).getTime() - 15 * 60_000;
      expect(Math.abs(reminder.schedule.at.getTime() - expectedAt)).toBeLessThan(5000);
      expect(reminder.body).toBe('Les Aigles - Les Loups commence dans 15 min sur Terrain 2');
      expect(reminder.extra).toMatchObject({ kind: 'reminder', slug: 'coupe-a1b2', teamId: 't1' });
      expect(reminder.id).toBeGreaterThanOrEqual(1_000_000);
      expect(reminder.id).toBeLessThan(2_000_000_000);
    });

    it('uses the lead time the user picked', async () => {
      settings.setGlobal({ reminderMinutes: 60 });
      getTeam.mockResolvedValue(buildTeamDetail([buildMatch({ timeSlot: inHours(3) })]));

      await service.syncReminders([FAVORITE]);

      const [reminder] = scheduleMock.mock.calls[0][0].notifications;
      const expectedAt = new Date(inHours(3)!.startTime).getTime() - 60 * 60_000;
      expect(Math.abs(reminder.schedule.at.getTime() - expectedAt)).toBeLessThan(5000);
      expect(reminder.body).toContain('60 min');
    });

    it('skips matches already past their reminder time, already started, or without a time', async () => {
      getTeam.mockResolvedValue(
        buildTeamDetail([
          buildMatch({ id: 'soon', timeSlot: inHours(0.1) }), // reminder time already passed
          buildMatch({ id: 'live', status: 'LIVE', timeSlot: inHours(1) }),
          buildMatch({ id: 'untimed', timeSlot: null }),
        ]),
      );

      await service.syncReminders([FAVORITE]);

      expect(scheduleMock).not.toHaveBeenCalled();
    });

    it('schedules nothing when reminders (or notifications) are turned off', async () => {
      getTeam.mockResolvedValue(buildTeamDetail([buildMatch({ timeSlot: inHours(2) })]));
      settings.setGlobal({ reminder: false });

      await service.syncReminders([FAVORITE]);

      expect(getTeam).not.toHaveBeenCalled();
      expect(scheduleMock).not.toHaveBeenCalled();
    });

    it('sends only one reminder for a match whose two teams are both favorites', async () => {
      const match = buildMatch({ id: 'derby', timeSlot: inHours(2) });
      getTeam.mockResolvedValue(buildTeamDetail([match]));

      await service.syncReminders([
        FAVORITE,
        { tournamentSlug: 'coupe-a1b2', teamId: 't2', teamName: 'Les Loups' },
      ]);

      expect(scheduleMock.mock.calls[0][0].notifications).toHaveLength(1);
    });

    it('cancels the previous reminders of a favorite before re-creating them', async () => {
      getPendingMock.mockResolvedValue({
        notifications: [
          { id: 4242, extra: { kind: 'reminder', teamKey: 'coupe-a1b2:t1' } },
          { id: 7, extra: { kind: 'other' } },
        ],
      });
      getTeam.mockResolvedValue(buildTeamDetail([buildMatch({ timeSlot: inHours(2) })]));

      await service.syncReminders([FAVORITE]);

      expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: 4242 }] });
    });

    it('cancels the reminders of a team that is no longer a favorite', async () => {
      getPendingMock.mockResolvedValue({
        notifications: [{ id: 99, extra: { kind: 'reminder', teamKey: 'old:tx' } }],
      });

      await service.syncReminders([]);

      expect(cancelMock).toHaveBeenCalledWith({ notifications: [{ id: 99 }] });
    });

    it("keeps a team's existing reminders when its schedule can't be fetched", async () => {
      getPendingMock.mockResolvedValue({
        notifications: [{ id: 4242, extra: { kind: 'reminder', teamKey: 'coupe-a1b2:t1' } }],
      });
      getTeam.mockRejectedValue(new Error('offline'));

      await service.syncReminders([FAVORITE]);

      expect(cancelMock).not.toHaveBeenCalled();
    });
  });

  describe('permission and test notification', () => {
    it('requestPermission calls through to the native plugin without throwing', async () => {
      requestPermissionsMock.mockResolvedValue({ display: 'granted' });

      await service.requestPermission();

      expect(requestPermissionsMock).toHaveBeenCalled();
    });

    it('reports the permission state', async () => {
      checkPermissionsMock.mockResolvedValue({ display: 'denied' });
      expect(await service.permissionState()).toBe('denied');
      checkPermissionsMock.mockResolvedValue({ display: 'granted' });
      expect(await service.permissionState()).toBe('granted');
      checkPermissionsMock.mockResolvedValue({ display: 'prompt' });
      expect(await service.permissionState()).toBe('prompt');
    });

    it('schedules a test notification a few seconds out once allowed', async () => {
      requestPermissionsMock.mockResolvedValue({ display: 'granted' });
      checkPermissionsMock.mockResolvedValue({ display: 'granted' });

      const sent = await service.sendTest();

      expect(sent).toBe(true);
      const [test] = scheduleMock.mock.calls[0][0].notifications;
      expect(test.schedule.at.getTime()).toBeGreaterThan(Date.now() + 5000);
      expect(test.body).toContain('Notification de test');
    });

    it("doesn't send the test when notifications are denied", async () => {
      requestPermissionsMock.mockResolvedValue({ display: 'denied' });
      checkPermissionsMock.mockResolvedValue({ display: 'denied' });

      expect(await service.sendTest()).toBe(false);
      expect(scheduleMock).not.toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('opens the team page when a notification is tapped', async () => {
      const favorites = signal<FavoriteTeam[]>([]);
      service.init(favorites);

      const handler = addListenerMock.mock.calls[0][1] as (event: unknown) => void;
      handler({ notification: { extra: { slug: 'coupe-a1b2', teamId: 't1' } } });

      expect(addListenerMock.mock.calls[0][0]).toBe('localNotificationActionPerformed');
      expect(navigate).toHaveBeenCalledWith(['/', 'coupe-a1b2', 'team', 't1']);
    });

    it('ignores a tap with no usable destination', () => {
      service.init(signal<FavoriteTeam[]>([]));

      const handler = addListenerMock.mock.calls[0][1] as (event: unknown) => void;
      handler({ notification: { extra: { slug: 42 } } });
      handler({ notification: {} });

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
