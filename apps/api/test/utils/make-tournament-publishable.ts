import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

/**
 * TournamentsService.assertReadyToPublish (added once publish() started
 * requiring a real category + structure, see its own doc comment) rejects
 * publish() with a ConflictException for a tournament that has neither --
 * every e2e fixture that calls publish() now needs one first. Adds a bare
 * KNOCKOUT phase (no calendar to generate: only a real GROUP_STAGE phase
 * needs match count > 0, see assertReadyToPublish) to `categoryId` if given,
 * else first creates a throwaway category of its own -- the cheapest
 * structure that satisfies the gate without pulling in structure-presets/
 * teams/schedule generation just to publish in a test that isn't actually
 * exercising the tournament's structure itself.
 */
export async function makeTournamentPublishable(
  app: INestApplication<App>,
  auth: (req: request.Test) => request.Test,
  base: string,
  tournamentId: string,
  categoryId?: string,
): Promise<void> {
  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId) {
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Général' })
      .expect(201);
    resolvedCategoryId = (categoryRes.body as { id: string }).id;
  }
  await auth(
    request(app.getHttpServer()).post(
      `${base}/${tournamentId}/categories/${resolvedCategoryId}/phases`,
    ),
  )
    .send({ name: 'Tableau final', type: 'KNOCKOUT' })
    .expect(201);
}
