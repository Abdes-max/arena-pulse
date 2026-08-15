import { IncomingMessage, Server } from 'http';
import http from 'http';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

/** Reads one SSE "data: ..." line from a streaming response, or rejects on timeout. */
function readNextSseEvent(
  res: IncomingMessage,
  timeoutMs = 5000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for SSE event')),
      timeoutMs,
    );
    let buffer = '';
    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const match = /data:\s*(.+)\r?\n/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(JSON.parse(match[1]));
      }
    });
    res.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe('Public realtime updates (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let port: number;

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await app.listen(0);
    const address = (app.getHttpServer() as Server).address();
    port = address && typeof address === 'object' ? address.port : 0;
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('streams a match-updated event when a score is entered', async () => {
    const email = 'organizer@example.com';
    const password = 'a-very-strong-password';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationName: 'Ada Tournaments',
      })
      .expect(201);
    // register() no longer issues a session -- mark the test account
    // verified directly in DB (bypassing the email link) and log in.
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = loginRes.body as AuthResponseBody;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const organizationId = (meRes.body as { organizations: { id: string }[] })
      .organizations[0].id;
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const sportRes = await auth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe Temps Réel', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const slug = (tournamentRes.body as { slug: string }).slug;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'Senior' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    const phaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Poules', type: 'GROUP_STAGE' })
      .expect(201);
    const phaseId = (phaseRes.body as { id: string }).id;

    const groupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/groups`,
      ),
    )
      .send({ name: 'Poule A' })
      .expect(201);
    const groupId = (groupRes.body as { id: string }).id;

    for (const name of ['Lions', 'Tigers']) {
      const teamRes = await auth(
        request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
      )
        .send({ name, categoryId })
        .expect(201);
      const teamId = (teamRes.body as { id: string }).id;
      await auth(
        request(app.getHttpServer()).patch(
          `${base}/${tournamentId}/teams/${teamId}/group`,
        ),
      )
        .send({ groupId })
        .expect(200);
    }

    const venueRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/venues`),
    )
      .send({ name: 'Stade' })
      .expect(201);
    const venueId = (venueRes.body as { id: string }).id;
    const fieldRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/venues/${venueId}/fields`,
      ),
    )
      .send({ name: 'Terrain 1' })
      .expect(201);
    const fieldId = (fieldRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds: [fieldId], startDateTime: new Date().toISOString() })
      .expect(201);

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);

    const match = await prisma.match.findFirst({ where: { groupId } });
    expect(match).not.toBeNull();

    const sseRequest = http.get({
      host: '127.0.0.1',
      port,
      path: `/api/v1/public/tournaments/${slug}/events`,
    });
    const eventPromise = new Promise((resolve, reject) => {
      sseRequest.on('response', (res) => {
        readNextSseEvent(res).then(resolve, reject);
      });
      sseRequest.on('error', reject);
    });

    try {
      // Give the SSE connection a moment to attach before triggering the mutation.
      await new Promise((resolve) => setTimeout(resolve, 200));

      await auth(
        request(app.getHttpServer()).put(
          `${base}/${tournamentId}/matches/${match!.id}/score`,
        ),
      )
        .send({ homeScore: 2, awayScore: 1 })
        .expect(200);

      await expect(eventPromise).resolves.toMatchObject({
        type: 'match-updated',
        matchId: match!.id,
      });
    } finally {
      sseRequest.destroy();
    }
  }, 15000);
});
