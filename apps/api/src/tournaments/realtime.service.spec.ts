import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  it('delivers an event only to subscribers of the matching tournament', () => {
    const service = new RealtimeService();
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];

    service
      .forTournament('tournament-a')
      .subscribe((event) => receivedA.push(event));
    service
      .forTournament('tournament-b')
      .subscribe((event) => receivedB.push(event));

    service.emit({
      tournamentId: 'tournament-a',
      type: 'match-updated',
      matchId: 'match-1',
    });

    expect(receivedA).toEqual([
      {
        tournamentId: 'tournament-a',
        type: 'match-updated',
        matchId: 'match-1',
      },
    ]);
    expect(receivedB).toEqual([]);
  });

  it('delivers events emitted after subscription, in order', () => {
    const service = new RealtimeService();
    const received: string[] = [];

    service
      .forTournament('t1')
      .subscribe((event) => received.push(event.matchId));

    service.emit({ tournamentId: 't1', type: 'match-updated', matchId: 'm1' });
    service.emit({ tournamentId: 't1', type: 'match-updated', matchId: 'm2' });

    expect(received).toEqual(['m1', 'm2']);
  });
});
