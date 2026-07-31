import { signal } from '@angular/core';

export interface MatchUpdatedEvent {
  matchId: string;
}

/** Wraps a tournament's SSE stream: debounces bursts and exposes the latest event as a signal. */
export class TournamentEventStream {
  private readonly _lastEvent = signal<MatchUpdatedEvent | null>(null);
  readonly lastEvent = this._lastEvent.asReadonly();

  private eventSource: EventSource | null = null;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly debounceMs = 300) {}

  connect(url: string): void {
    this.close();
    this.eventSource = new EventSource(url);
    this.eventSource.onmessage = (message: MessageEvent<string>) => {
      const payload = JSON.parse(message.data) as MatchUpdatedEvent;
      if (this.debounceHandle) {
        clearTimeout(this.debounceHandle);
      }
      this.debounceHandle = setTimeout(() => this._lastEvent.set(payload), this.debounceMs);
    };
  }

  close(): void {
    this.eventSource?.close();
    this.eventSource = null;
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
  }
}
