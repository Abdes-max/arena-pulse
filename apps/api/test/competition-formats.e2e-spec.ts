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

interface PhaseResponseBody {
  id: string;
  name: string;
  type: string;
  groups: { id: string; name: string }[];
  knockoutBracket: {
    id: string;
    name: string;
    size: number;
    hasRankingMatch: boolean;
  } | null;
}

async function registerOrganizer(app: INestApplication<App>) {
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
  // register() no longer issues a session -- mark the test account verified
  // directly in DB (bypassing the email link) and log in for real tokens,
  // mirroring what a real user does after clicking the verification link.
  await app
    .get(PrismaService)
    .user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const { accessToken } = loginRes.body as AuthResponseBody;
  const meRes = await request(app.getHttpServer())
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);
  const { organizations } = meRes.body as { organizations: { id: string }[] };
  return { accessToken, organizationId: organizations[0].id };
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
      emailVerifiedAt: new Date(),
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

describe('Competition formats (e2e)', () => {
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

  it('builds a full pool -> qualification -> knockout structure and assigns a team to a group', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;
    const phasesBase = `${base}/${tournamentId}/categories/${categoryId}/phases`;

    const poolPhaseRes = await auth(
      request(app.getHttpServer()).post(phasesBase),
    )
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(201);
    const poolPhaseId = (poolPhaseRes.body as { id: string }).id;

    const groupRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${poolPhaseId}/groups`,
      ),
    )
      .send({ name: 'Poule A' })
      .expect(201);
    const groupId = (groupRes.body as { id: string }).id;

    const standingRuleUrl = `${base}/${tournamentId}/groups/${groupId}/standing-rule`;
    const defaultRuleRes = await auth(
      request(app.getHttpServer()).get(standingRuleUrl),
    ).expect(200);
    expect(defaultRuleRes.body).toEqual({
      groupId,
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      tieBreakOrder: [
        'POINTS',
        'GOAL_DIFFERENCE',
        'GOALS_SCORED',
        'HEAD_TO_HEAD',
      ],
      supplementaryStandingEnabled: false,
      penaltyShootoutEnabled: false,
    });

    const updatedRuleRes = await auth(
      request(app.getHttpServer()).put(standingRuleUrl),
    )
      .send({ winPoints: 4, penaltyShootoutEnabled: true })
      .expect(200);
    expect((updatedRuleRes.body as { winPoints: number }).winPoints).toBe(4);
    expect(
      (updatedRuleRes.body as { penaltyShootoutEnabled: boolean })
        .penaltyShootoutEnabled,
    ).toBe(true);

    const teamRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
    )
      .send({ name: 'Les Aigles', categoryId })
      .expect(201);
    const teamId = (teamRes.body as { id: string }).id;

    const assignRes = await auth(
      request(app.getHttpServer()).patch(
        `${base}/${tournamentId}/teams/${teamId}/group`,
      ),
    )
      .send({ groupId })
      .expect(200);
    expect(
      (assignRes.body as { groupId: string; groupName: string }).groupName,
    ).toBe('Poule A');

    // A group can only be created on a GROUP_STAGE phase.
    const knockoutPhaseRes = await auth(
      request(app.getHttpServer()).post(phasesBase),
    )
      .send({ name: 'Phase finale', type: 'KNOCKOUT' })
      .expect(201);
    const knockoutPhaseId = (knockoutPhaseRes.body as { id: string }).id;
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${knockoutPhaseId}/groups`,
      ),
    )
      .send({ name: 'Poule invalide' })
      .expect(400);

    const bracketRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${knockoutPhaseId}/knockout-bracket`,
      ),
    )
      .send({ name: 'Champions League', size: 8, hasRankingMatch: true })
      .expect(201);
    expect((bracketRes.body as { size: number }).size).toBe(8);

    // Only one bracket per phase.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${knockoutPhaseId}/knockout-bracket`,
      ),
    )
      .send({ name: 'Autre tableau', size: 4 })
      .expect(409);

    // A bracket can only be created on a KNOCKOUT phase.
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/phases/${poolPhaseId}/knockout-bracket`,
      ),
    )
      .send({ name: 'Invalide', size: 4 })
      .expect(400);

    const qualificationRulesUrl = `${base}/${tournamentId}/groups/${groupId}/qualification-rules`;
    const ruleRes = await auth(
      request(app.getHttpServer()).post(qualificationRulesUrl),
    )
      .send({ fromPosition: 1, toPosition: 2, targetPhaseId: knockoutPhaseId })
      .expect(201);
    expect((ruleRes.body as { targetPhaseName: string }).targetPhaseName).toBe(
      'Phase finale',
    );

    // A qualification rule can't target its own source phase.
    await auth(request(app.getHttpServer()).post(qualificationRulesUrl))
      .send({ fromPosition: 1, toPosition: 2, targetPhaseId: poolPhaseId })
      .expect(400);

    const phasesListRes = await auth(
      request(app.getHttpServer()).get(phasesBase),
    ).expect(200);
    const phases = phasesListRes.body as PhaseResponseBody[];
    const listedPoolPhase = phases.find((p) => p.id === poolPhaseId)!;
    expect(listedPoolPhase.groups).toHaveLength(1);
    const listedKnockoutPhase = phases.find((p) => p.id === knockoutPhaseId)!;
    expect(listedKnockoutPhase.knockoutBracket?.name).toBe('Champions League');
  });

  it("resolves real teams for a KNOCKOUT_ONLY preset's round 1, letting a score be entered right away", async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe U11', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'U11' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      await auth(
        request(app.getHttpServer()).post(`${base}/${tournamentId}/teams`),
      )
        .send({ name, categoryId })
        .expect(201);
    }

    const presetRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/structure-presets`,
      ),
    )
      .send({ format: 'KNOCKOUT_ONLY', teamCount: 4 })
      .expect(201);
    const { tiers } = presetRes.body as { tiers: { phaseId: string }[] };
    const bracketPhaseId = tiers[0].phaseId;

    const phasesRes = await auth(
      request(app.getHttpServer()).get(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    ).expect(200);
    const bracketPhase = (phasesRes.body as PhaseResponseBody[]).find(
      (phase) => phase.id === bracketPhaseId,
    )!;
    const bracketId = bracketPhase.knockoutBracket!.id;

    const generatedRes = await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/knockout-brackets/${bracketId}/generate-matches`,
      ),
    ).expect(201);
    const generated = generatedRes.body as {
      id: string;
      round: number;
      homeTeam: { id: string; name: string } | null;
      awayTeam: { id: string; name: string } | null;
    }[];

    const round1 = generated.filter((match) => match.round === 1);
    expect(round1).toHaveLength(2);
    // Regression: a KNOCKOUT_ONLY preset's fictitious seed group never has
    // any match to play, so StandingsService.getStandings never considered
    // it "complete" -- round 1 stayed stuck on generic placeholder labels
    // ("1er Équipes engagées"...) forever, with no real team ever assigned
    // and no way to enter a score.
    for (const match of round1) {
      expect(match.homeTeam).not.toBeNull();
      expect(match.awayTeam).not.toBeNull();
    }

    await auth(
      request(app.getHttpServer()).put(
        `${base}/${tournamentId}/matches/${round1[0].id}/score`,
      ),
    )
      .send({ homeScore: 2, awayScore: 1 })
      .expect(200);

    // Regression: a KNOCKOUT_ONLY preset's fictitious seed group isn't a
    // real pool the team ever played -- the public team page shouldn't show
    // a "Classement de poule" for it (PublicService.getTeam nulls out
    // `standing` for a seed-phase group).
    const tournamentRes2 = await auth(
      request(app.getHttpServer()).get(`${base}/${tournamentId}`),
    ).expect(200);
    const slug = (tournamentRes2.body as { slug: string }).slug;
    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/publish`),
    ).expect(200);
    const publicTeamsRes = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}/teams`)
      .expect(200);
    const anyTeamId = (publicTeamsRes.body as { id: string }[])[0].id;
    const publicTeamRes = await request(app.getHttpServer())
      .get(`/api/v1/public/tournaments/${slug}/teams/${anyTeamId}`)
      .expect(200);
    expect((publicTeamRes.body as { standing: unknown }).standing).toBeNull();
  });

  it('rejects a phase whose category belongs to another tournament', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentARes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe A', sportId })
      .expect(201);
    const tournamentAId = (tournamentARes.body as { id: string }).id;
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentAId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    const tournamentBRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe B', sportId })
      .expect(201);
    const tournamentBId = (tournamentBRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentBId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(404);
  });

  it('rejects writes on phases when the tournament is archived', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;

    await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/archive`),
    ).expect(200);
    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/categories/${categoryId}/phases`,
      ),
    )
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(409);
  });

  it('gates phase writes behind MANAGE_PHASES', async () => {
    const { accessToken, organizationId } = await registerOrganizer(app);
    const sportId = await firstSportId(app, accessToken);
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const base = `/api/v1/organizations/${organizationId}/tournaments`;

    const tournamentRes = await auth(request(app.getHttpServer()).post(base))
      .send({ name: 'Coupe', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;
    const categoryRes = await auth(
      request(app.getHttpServer()).post(`${base}/${tournamentId}/categories`),
    )
      .send({ name: 'U10' })
      .expect(201);
    const categoryId = (categoryRes.body as { id: string }).id;
    const phasesBase = `${base}/${tournamentId}/categories/${categoryId}/phases`;

    const member = await addOrganizationMember(
      app,
      organizationId,
      'member@example.com',
      'a-very-strong-password',
    );
    const authAsMember = (req: request.Test) =>
      req.set('Authorization', `Bearer ${member.accessToken}`);

    await authAsMember(request(app.getHttpServer()).post(phasesBase))
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(403);

    await auth(
      request(app.getHttpServer()).post(
        `${base}/${tournamentId}/administrators`,
      ),
    )
      .send({ email: 'member@example.com', permissionKeys: ['MANAGE_PHASES'] })
      .expect(201);

    await authAsMember(request(app.getHttpServer()).post(phasesBase))
      .send({ name: 'Phase de poules', type: 'GROUP_STAGE' })
      .expect(201);

    await auth(request(app.getHttpServer()).post(phasesBase))
      .send({ name: 'Phase de poules bis', type: 'GROUP_STAGE' })
      .expect(201);
  });
});
