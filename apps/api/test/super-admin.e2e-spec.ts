import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TournamentPublicationOrderStatus } from '../generated/prisma/client';
import { PasswordService } from '../src/auth/password.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { makeTournamentPublishable } from './utils/make-tournament-publishable';
import { resetDatabase } from './utils/reset-database';

interface SuperAdminAuthResponseBody {
  accessToken: string;
}

interface AuthResponseBody {
  accessToken: string;
}

interface SuperAdminOrganizationRow {
  id: string;
  name: string;
  membersCount: number;
  tournamentsCount: number;
  suspendedAt: string | null;
}

interface SuperAdminUserRow {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
}

interface SuperAdminPaymentRow {
  id: string;
  type: string;
  status: string;
  note: string | null;
}

const SUPER_ADMIN_CREDENTIALS = {
  email: 'superadmin@example.com',
  password: 'a-very-strong-password',
};

describe('Super admin data endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  /** SuperAdminAccount has no HTTP registration path -- inserted directly, exactly like the real create-super-admin.ts script does. */
  async function createSuperAdminAndLogin(): Promise<string> {
    const passwordService = app.get(PasswordService);
    await prisma.superAdminAccount.create({
      data: {
        email: SUPER_ADMIN_CREDENTIALS.email,
        passwordHash: await passwordService.hash(
          SUPER_ADMIN_CREDENTIALS.password,
        ),
        firstName: 'Super',
        lastName: 'Admin',
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/super-admin-auth/login')
      .send(SUPER_ADMIN_CREDENTIALS)
      .expect(200);
    return (loginRes.body as SuperAdminAuthResponseBody).accessToken;
  }

  async function registerOrganizer(
    email = 'organizer@example.com',
    organizationName = 'Ada Tournaments',
  ) {
    const password = 'a-very-strong-password';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Ada',
        lastName: 'Lovelace',
        organizationName,
      })
      .expect(201);
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const accessToken = (loginRes.body as AuthResponseBody).accessToken;
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const { organizations } = meRes.body as { organizations: { id: string }[] };
    return {
      accessToken,
      organizationId: organizations[0].id,
      email,
      password,
    };
  }

  beforeEach(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('lists organizations, users and stats with the right shape', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { organizationId } = await registerOrganizer();
    const auth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${superAdminToken}`);

    const orgsRes = await auth(
      request(app.getHttpServer()).get('/api/v1/super-admin/organizations'),
    ).expect(200);
    const organization = (orgsRes.body as SuperAdminOrganizationRow[]).find(
      (o) => o.id === organizationId,
    );
    expect(organization).toMatchObject({
      name: 'Ada Tournaments',
      membersCount: 1,
      tournamentsCount: 0,
      suspendedAt: null,
    });

    const detailRes = await auth(
      request(app.getHttpServer()).get(
        `/api/v1/super-admin/organizations/${organizationId}`,
      ),
    ).expect(200);
    expect(
      (detailRes.body as { members: { email: string }[] }).members,
    ).toHaveLength(1);

    const usersRes = await auth(
      request(app.getHttpServer()).get('/api/v1/super-admin/users'),
    ).expect(200);
    const user = (usersRes.body as SuperAdminUserRow[]).find(
      (u) => u.email === 'organizer@example.com',
    );
    expect(user?.emailVerifiedAt).not.toBeNull();

    const statsRes = await auth(
      request(app.getHttpServer()).get('/api/v1/super-admin/stats'),
    ).expect(200);
    const stats = statsRes.body as {
      totalUsers: number;
      totalOrganizations: number;
    };
    expect(typeof stats.totalUsers).toBe('number');
    expect(stats.totalOrganizations).toBeGreaterThanOrEqual(1);
  });

  it('rejects organization list/stats access with an organizer token', async () => {
    const { accessToken } = await registerOrganizer();

    await request(app.getHttpServer())
      .get('/api/v1/super-admin/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('suspending an organization blocks publish, reactivating unblocks it', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { accessToken, organizationId } = await registerOrganizer();
    const orgAuth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const superAuth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${superAdminToken}`);

    const sportRes = await orgAuth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;
    const tournamentRes = await orgAuth(
      request(app.getHttpServer()).post(
        `/api/v1/organizations/${organizationId}/tournaments`,
      ),
    )
      .send({ name: 'Coupe Suspension', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    await superAuth(
      request(app.getHttpServer()).post(
        `/api/v1/super-admin/organizations/${organizationId}/suspend`,
      ),
    ).expect(204);

    await orgAuth(
      request(app.getHttpServer()).post(
        `/api/v1/organizations/${organizationId}/tournaments/${tournamentId}/publish`,
      ),
    ).expect(403);

    // A second suspend on an already-suspended organization is rejected, not silently repeated.
    await superAuth(
      request(app.getHttpServer()).post(
        `/api/v1/super-admin/organizations/${organizationId}/suspend`,
      ),
    ).expect(409);

    await superAuth(
      request(app.getHttpServer()).post(
        `/api/v1/super-admin/organizations/${organizationId}/reactivate`,
      ),
    ).expect(204);

    await makeTournamentPublishable(
      app,
      orgAuth,
      `/api/v1/organizations/${organizationId}/tournaments`,
      tournamentId,
    );
    await orgAuth(
      request(app.getHttpServer()).post(
        `/api/v1/organizations/${organizationId}/tournaments/${tournamentId}/publish`,
      ),
    ).expect(200);
  });

  it("verifying a user's email by hand unblocks their login", async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const superAuth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${superAdminToken}`);
    const email = 'unverified@example.com';
    const password = 'a-very-strong-password';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        firstName: 'Non',
        lastName: 'Vérifié',
        organizationName: 'Org X',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(403);

    const usersRes = await superAuth(
      request(app.getHttpServer()).get('/api/v1/super-admin/users'),
    ).expect(200);
    const user = (usersRes.body as SuperAdminUserRow[]).find(
      (u) => u.email === email,
    );
    if (!user) {
      throw new Error('User not found in super-admin users list');
    }

    await superAuth(
      request(app.getHttpServer()).post(
        `/api/v1/super-admin/users/${user.id}/verify-email`,
      ),
    ).expect(204);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);

    // Already-verified accounts can't be "verified" again.
    await superAuth(
      request(app.getHttpServer()).post(
        `/api/v1/super-admin/users/${user.id}/verify-email`,
      ),
    ).expect(409);
  });

  it('annotates a stuck payment without touching its status, visible in the payments list', async () => {
    const superAdminToken = await createSuperAdminAndLogin();
    const { accessToken, organizationId } = await registerOrganizer();
    const orgAuth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${accessToken}`);
    const superAuth = (req: request.Test) =>
      req.set('Authorization', `Bearer ${superAdminToken}`);

    const sportRes = await orgAuth(
      request(app.getHttpServer()).get('/api/v1/sports'),
    ).expect(200);
    const sportId = (sportRes.body as { id: string }[])[0].id;
    const tournamentRes = await orgAuth(
      request(app.getHttpServer()).post(
        `/api/v1/organizations/${organizationId}/tournaments`,
      ),
    )
      .send({ name: 'Coupe Paiement Bloqué', sportId })
      .expect(201);
    const tournamentId = (tournamentRes.body as { id: string }).id;

    // A webhook that never arrived, simulated directly -- this endpoint
    // doesn't care how the row got stuck, only that it exists.
    const order = await prisma.tournamentPublicationOrder.create({
      data: {
        tournamentId,
        status: TournamentPublicationOrderStatus.PENDING_PAYMENT,
        categoriesCount: 0,
        teamsCount: 0,
        amountCents: 2500,
        currency: 'eur',
      },
    });

    await superAuth(
      request(app.getHttpServer()).post(
        `/api/v1/super-admin/payments/PUBLICATION/${order.id}/annotate`,
      ),
    )
      .send({ note: 'Confirmé manuellement dans le dashboard Stripe.' })
      .expect(204);

    const paymentsRes = await superAuth(
      request(app.getHttpServer()).get('/api/v1/super-admin/payments'),
    ).expect(200);
    const row = (paymentsRes.body as SuperAdminPaymentRow[]).find(
      (p) => p.id === order.id,
    );
    expect(row).toMatchObject({
      type: 'PUBLICATION',
      status: TournamentPublicationOrderStatus.PENDING_PAYMENT,
      note: 'Confirmé manuellement dans le dashboard Stripe.',
    });

    await superAuth(
      request(app.getHttpServer()).post(
        '/api/v1/super-admin/payments/UNKNOWN_TYPE/some-id/annotate',
      ),
    )
      .send({ note: 'irrelevant' })
      .expect(400);
  });
});
