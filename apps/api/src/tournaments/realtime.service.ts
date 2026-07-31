import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter } from 'rxjs';

export interface TournamentEvent {
  tournamentId: string;
  type: 'match-updated';
  matchId: string;
}

/**
 * In-process event bus for the public site's SSE stream
 * (docs/architecture/realtime-strategy.md) — a single Subject shared by
 * every tournament, filtered per-subscriber by tournamentId. Deliberately
 * not a distributed broker: this only works correctly with a single API
 * instance, a documented limitation until horizontal scaling is needed.
 */
@Injectable()
export class RealtimeService {
  private readonly events = new Subject<TournamentEvent>();

  emit(event: TournamentEvent): void {
    this.events.next(event);
  }

  forTournament(tournamentId: string): Observable<TournamentEvent> {
    return this.events.pipe(
      filter((event) => event.tournamentId === tournamentId),
    );
  }
}
