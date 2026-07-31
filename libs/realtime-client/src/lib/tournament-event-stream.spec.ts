import { TournamentEventStream } from './tournament-event-stream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  close(): void {
    this.closed = true;
  }
}

describe('TournamentEventStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens an EventSource at the given url on connect', () => {
    const stream = new TournamentEventStream();
    stream.connect('http://api.test/events');
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('http://api.test/events');
  });

  it('debounces incoming events before updating lastEvent', () => {
    const stream = new TournamentEventStream(300);
    stream.connect('http://api.test/events');
    const source = FakeEventSource.instances[0];

    source.emit({ matchId: 'm1' });
    expect(stream.lastEvent()).toBeNull();

    vi.advanceTimersByTime(299);
    expect(stream.lastEvent()).toBeNull();

    vi.advanceTimersByTime(1);
    expect(stream.lastEvent()).toEqual({ matchId: 'm1' });
  });

  it('collapses a burst of events into the latest one', () => {
    const stream = new TournamentEventStream(300);
    stream.connect('http://api.test/events');
    const source = FakeEventSource.instances[0];

    source.emit({ matchId: 'm1' });
    vi.advanceTimersByTime(100);
    source.emit({ matchId: 'm2' });
    vi.advanceTimersByTime(300);

    expect(stream.lastEvent()).toEqual({ matchId: 'm2' });
  });

  it('closes the underlying EventSource and clears pending debounce on close()', () => {
    const stream = new TournamentEventStream(300);
    stream.connect('http://api.test/events');
    const source = FakeEventSource.instances[0];

    source.emit({ matchId: 'm1' });
    stream.close();
    vi.advanceTimersByTime(300);

    expect(source.closed).toBe(true);
    expect(stream.lastEvent()).toBeNull();
  });

  it('closes any previous connection when connect() is called again', () => {
    const stream = new TournamentEventStream();
    stream.connect('http://api.test/events-1');
    const first = FakeEventSource.instances[0];
    stream.connect('http://api.test/events-2');

    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
