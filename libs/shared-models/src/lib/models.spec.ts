import type { Match, PublicTournament } from './models';

// This lib only exports TypeScript types/interfaces (no runtime code), so
// there's nothing to unit test — this smoke test exists solely so the
// `ng test shared-models` tooling has a spec file to run.
describe('shared-models', () => {
  it('exposes types that compile against a sample object', () => {
    const tournament: Pick<PublicTournament, 'id' | 'name' | 'status'> = {
      id: 't1',
      name: 'Test',
      status: 'PUBLISHED',
    };
    const match: Pick<Match, 'id' | 'status'> = { id: 'm1', status: 'SCHEDULED' };

    expect(tournament.id).toBe('t1');
    expect(match.status).toBe('SCHEDULED');
  });
});
