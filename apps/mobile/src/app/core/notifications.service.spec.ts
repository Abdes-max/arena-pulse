import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PublicApiService } from 'api-client';
import { Match, PublicTeamDetail } from 'shared-models';
import { NotificationsService } from './notifications.service';

const { scheduleMock, requestPermissionsMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  requestPermissionsMock: vi.fn(),
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: scheduleMock,
    requestPermissions: requestPermissionsMock,
  },
}));

function buildMatch(overrides: Partial<Match>): Match {
  return {
    id: 'match-1',
    groupId: null,
    knockoutBracketId: null,
    bracketSlot: null,
    isThirdPlaceMatch: false,
    round: 1,
    status: 'SCHEDULED',
    homeTeam: { id: 't1', name: 'Les Aigles' },
    awayTeam: { id: 't2', name: 'Les Loups' },
    forfeitedTeam: null,
    timeSlot: null,
    officials: [],
    score: null,
    ...overrides,
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
    position: 1,
    matches,
    standing: null,
  };
}

describe('NotificationsService', () => {
  let getTeam: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scheduleMock.mockClear();
    requestPermissionsMock.mockClear();
    getTeam = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: PublicApiService, useValue: { getTeam } }],
    });
  });

  it('does not notify on the first sighting of a match (establishes the baseline)', async () => {
    getTeam.mockResolvedValue(buildTeamDetail([buildMatch({ status: 'LIVE' })]));
    const service = TestBed.inject(NotificationsService);

    await service.checkFavoriteUpdates('coupe-a1b2', [
      { tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' },
    ]);

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('notifies when a tracked match transitions to LIVE', async () => {
    getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'SCHEDULED' })]));
    const service = TestBed.inject(NotificationsService);
    const favorites = [{ tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' }];
    await service.checkFavoriteUpdates('coupe-a1b2', favorites);

    getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'LIVE' })]));
    await service.checkFavoriteUpdates('coupe-a1b2', favorites);

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    const body = scheduleMock.mock.calls[0][0].notifications[0].body as string;
    expect(body).toContain('Les Aigles');
    expect(body).toContain('commencé');
  });

  it('notifies with the score when a tracked match gets a new score', async () => {
    getTeam.mockResolvedValueOnce(buildTeamDetail([buildMatch({ status: 'LIVE', score: null })]));
    const service = TestBed.inject(NotificationsService);
    const favorites = [{ tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' }];
    await service.checkFavoriteUpdates('coupe-a1b2', favorites);

    getTeam.mockResolvedValueOnce(
      buildTeamDetail([
        buildMatch({
          status: 'LIVE',
          score: {
            homeScore: 1,
            awayScore: 0,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: false,
            validatedAt: null,
          },
        }),
      ]),
    );
    await service.checkFavoriteUpdates('coupe-a1b2', favorites);

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    const body = scheduleMock.mock.calls[0][0].notifications[0].body as string;
    expect(body).toBe('Les Aigles 1 - 0 Les Loups');
  });

  it('does not notify again when nothing changed between checks', async () => {
    const match = buildMatch({ status: 'LIVE' });
    getTeam.mockResolvedValue(buildTeamDetail([match]));
    const service = TestBed.inject(NotificationsService);
    const favorites = [{ tournamentSlug: 'coupe-a1b2', teamId: 't1', teamName: 'Les Aigles' }];

    await service.checkFavoriteUpdates('coupe-a1b2', favorites);
    await service.checkFavoriteUpdates('coupe-a1b2', favorites);

    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('requestPermission calls through to the native plugin without throwing', async () => {
    requestPermissionsMock.mockResolvedValue({ display: 'granted' });
    const service = TestBed.inject(NotificationsService);

    await service.requestPermission();

    expect(requestPermissionsMock).toHaveBeenCalled();
  });
});
