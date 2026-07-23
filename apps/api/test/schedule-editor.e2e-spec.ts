import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { OrganizationRole } from '../generated/prisma/client';
import { PasswordService } from '../src/auth/password.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

interface AuthResponseBody {
  accessToken: string;
  organization?: { id: string };
}

interface MatchResponseBody {
  id: string;
  round: number;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  timeSlot: { id: string; startTime: string; endTime: string } | null;
  officials: { id: string; referee: { id: string } | null }[];
}

async function registerOrganizer(app: INestApplication<App>) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email: 'organizer@example.com',
      password: 'a-very-strong-password',
      firstName: 'Ada',
      lastName: 'Lovelace',
      organizationName: 'Ada Tournaments',
    })
    .expect(201);
  const body = res.body as AuthResponseBody;
  return {
    accessToken: body.accessToken,
    organizationId: body.organization!.id,
  };
}

async function firstSportId(
  app: INestApplication<App>,
  accessToken: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .get('/api/v1/sports')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  return (res.body as { id: string }[])[0].id;
}

async function addOrganizationMember(
  app: INestApplication<App>,
  organizationId: string,
  email: string,
  password: string,
) {
  const prisma = app.get(PrismaService);
  const passwordService = app.get(PasswordService);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await passwordService.hash(password),
      firstName: 'Rui',
      lastName: 'Referee',
    },
  });
  await prisma.organizationMember.create({
    data: {
      organizationId,
      userId: user.id,
      role: OrganizationRole.ORG_MEMBER,
    },
  });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return { accessToken: (loginRes.body as AuthResponseBody).accessToken };
}

function findMatch(
  matches: MatchResponseBody[],
  homeOrAway: string,
  other: string,
): MatchResponseBody {
  const match = matches.find(
    (m) =>
      (m.homeTeam?.name === homeOrAway && m.awayTeam?.name === other) ||
      (m.homeTeam?.name === other && m.awayTeam?.name === homeOrAway),
  );
  if (!match) {
    throw new Error(`Match ${homeOrAway} vs ${other} not found`);
  }
  return match;
}

describe('Schedule editor (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  async function setUpGeneratedSchedule(
    app: INestApplication<App>,
    auth: (req: request.Test) => request.Test,
    base: string,
    tournamentId: string,
  ) {
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    const phaseRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
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

    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
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
      .send({ name: 'Stade municipal' })
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
    const otherFieldRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/venues/${venueId}/fields`,
      ),
    )
      .send({ name: 'Terrain 2' })
      .expect(201);
    const otherFieldId = (otherFieldRes.body as { id: string }).id;

    const generateRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${phaseId}/generate-schedule`,
      ),
    )
      .send({ fieldIds: [fieldId], startDateTime: '2026-08-01T09:00:00.000Z' })
      .expect(201);

    return {
      phaseId,
      fieldId,
      otherFieldId,
      matches: generateRes.body as MatchResponseBody[],
    };
  }

  it('moves a match into an existing empty slot, and rejects an occupied one', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { otherFieldId, matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const alphaDelta = findMatch(matches, 'Alpha', 'Delta');
    const gammaDelta = findMatch(matches, 'Gamma', 'Delta');

    // Create a fresh, non-overlapping empty slot far away in time.
    const emptySlotRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/fields/${otherFieldId}/timeslots`,
      ),
    )
      .send({
        startTime: '2026-08-01T20:00:00.000Z',
        endTime: '2026-08-01T20:15:00.000Z',
      })
      .expect(201);
    const emptySlotId = (emptySlotRes.body as { id: string }).id;

    // Moving into the free slot succeeds.
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/matches/${gammaDelta.id}/timeslot`,
      ),
    )
      .send({ timeSlotId: emptySlotId })
      .expect(200);

    // Moving another match into Alpha-vs-Delta's still-occupied slot is rejected.
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/matches/${gammaDelta.id}/timeslot`,
      ),
    )
      .send({ timeSlotId: alphaDelta.timeSlot!.id })
      .expect(409);

    // Detaching leaves the match unscheduled.
    const detachRes = await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/matches/${gammaDelta.id}/timeslot`,
      ),
    )
      .send({ timeSlotId: null })
      .expect(200);
    expect((detachRes.body as MatchResponseBody).timeSlot).toBeNull();
  });

  it('rejects a move that would double-book a team, and detects official conflicts', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { otherFieldId, matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const alphaDelta = findMatch(matches, 'Alpha', 'Delta');
    const deltaBeta = findMatch(matches, 'Delta', 'Beta');
    const betaGamma = findMatch(matches, 'Beta', 'Gamma');

    // A slot overlapping Alpha-vs-Delta's window, on a different field.
    const overlapSlotRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/fields/${otherFieldId}/timeslots`,
      ),
    )
      .send({
        startTime: alphaDelta.timeSlot!.startTime,
        endTime: alphaDelta.timeSlot!.endTime,
      })
      .expect(201);
    const overlapSlotId = (overlapSlotRes.body as { id: string }).id;

    const refereeRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/referees`),
    )
      .send({ firstName: 'Rui', lastName: 'Referee' })
      .expect(201);
    const refereeId = (refereeRes.body as { id: string }).id;
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${alphaDelta.id}/officials`,
      ),
    )
      .send({ refereeId })
      .expect(201);

    // Delta already plays Alpha at this exact window — moving Delta-vs-Beta there conflicts.
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/matches/${deltaBeta.id}/timeslot`,
      ),
    )
      .send({ timeSlotId: overlapSlotId })
      .expect(409);

    // Beta-vs-Gamma has neither team playing at that window, so the move succeeds.
    await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/matches/${betaGamma.id}/timeslot`,
      ),
    )
      .send({ timeSlotId: overlapSlotId })
      .expect(200);

    // The referee is already officiating Alpha-vs-Delta at this same window.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${betaGamma.id}/officials`,
      ),
    )
      .send({ refereeId })
      .expect(409);

    // A team can't officiate its own match.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${betaGamma.id}/officials`,
      ),
    )
      .send({ refereeingTeamId: betaGamma.homeTeam!.id })
      .expect(400);

    // A different, uninvolved official can be added without conflict.
    const secondRefereeRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/referees`),
    )
      .send({ firstName: 'Léa', lastName: 'Arbitre' })
      .expect(201);
    const secondRefereeId = (secondRefereeRes.body as { id: string }).id;
    const addOfficialRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/matches/${betaGamma.id}/officials`,
      ),
    )
      .send({ refereeId: secondRefereeId })
      .expect(201);
    const officialId = (
      addOfficialRes.body as MatchResponseBody
    ).officials.find((o) => o.referee?.id === secondRefereeId)!.id;

    await auth(
      request(app.getHttpServer()).delete(
        `${base}/${tournamentId}/match-officials/${officialId}`,
      ),
    ).expect(204);
  });

  it('rejects a manually created time slot that overlaps another on the same field', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { fieldId, matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const someMatch = matches[0];

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/fields/${fieldId}/timeslots`,
      ),
    )
      .send({
        startTime: someMatch.timeSlot!.startTime,
        endTime: someMatch.timeSlot!.endTime,
        label: 'Pause',
      })
      .expect(409);
  });

  it('gates match rescheduling behind MANAGE_SCHEDULE', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const { matches } = await setUpGeneratedSchedule(
      app,
      auth,
      base,
      tournamentId,
    );
    const someMatch = matches[0];

    const member = await addOrganizationMember(
      app,
      organizationId,
      'member@example.com',
      'a-very-strong-password',
    );
    const authAsMember = (req: request.Test) =>
      req.set('Authorization', `Bearer ${member.accessToken}`);

    await authAsMember(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/matches/${someMatch.id}/timeslot`,
      ),
    )
      .send({ timeSlotId: null })
      .expect(403);

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/administrators`,
      ),
    )
      .send({
        email: 'member@example.com',
        permissionKeys: ['MANAGE_SCHEDULE'],
      })
      .expect(201);

    await authAsMember(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/matches/${someMatch.id}/timeslot`,
      ),
    )
      .send({ timeSlotId: null })
      .expect(200);
  });
});
