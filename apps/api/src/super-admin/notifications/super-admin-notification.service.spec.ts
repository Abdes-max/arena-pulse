import { ConfigService } from '@nestjs/config';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SuperAdminNotificationService } from './super-admin-notification.service';

describe('SuperAdminNotificationService', () => {
  let sendSuperAdminNotification: jest.Mock;
  let findMany: jest.Mock;
  let service: SuperAdminNotificationService;

  beforeEach(() => {
    sendSuperAdminNotification = jest.fn().mockResolvedValue(undefined);
    findMany = jest
      .fn()
      .mockResolvedValue([{ email: 'a@kelto.fr' }, { email: 'b@kelto.fr' }]);
    service = new SuperAdminNotificationService(
      { superAdminAccount: { findMany } } as unknown as PrismaService,
      { sendSuperAdminNotification } as unknown as MailService,
      { get: (_key: string, fallback: string) => fallback } as ConfigService,
    );
  });

  it('mails every super-admin account about a new organization', async () => {
    await service.organizationCreated({
      organizationId: 'org-1',
      organizationName: 'Padel Club',
      adminName: 'Marie Dupont',
      adminEmail: 'marie@example.com',
    });
    expect(sendSuperAdminNotification).toHaveBeenCalledTimes(2);
    const [to, notification] = sendSuperAdminNotification.mock.calls[0] as [
      string,
      { subject: string; link: { url: string } },
    ];
    expect(to).toBe('a@kelto.fr');
    expect(notification.subject).toBe('Nouvelle organisation : Padel Club');
    expect(notification.link.url).toBe(
      'http://localhost:4300/super-admin/organizations/org-1',
    );
  });

  it('describes a created and a published tournament', async () => {
    await service.tournamentCreated({
      tournamentId: 't-1',
      tournamentName: 'Open',
      organizationName: 'Padel Club',
      sportName: 'Padel',
    });
    await service.tournamentPublished({
      tournamentId: 't-1',
      tournamentName: 'Open',
      organizationName: 'Padel Club',
    });
    const subjects = sendSuperAdminNotification.mock.calls.map(
      (call: [string, { subject: string }]) => call[1].subject,
    );
    expect(subjects).toContain('Nouveau tournoi : Open');
    expect(subjects).toContain('Tournoi publié : Open');
  });

  it('formats a payment and skips free ones', async () => {
    await service.paymentReceived({
      kind: 'subscription',
      amountCents: 0,
      currency: 'eur',
      organizationName: 'Padel Club',
    });
    expect(findMany).not.toHaveBeenCalled();

    await service.paymentReceived({
      kind: 'publication',
      amountCents: 4900,
      currency: 'eur',
      organizationName: 'Padel Club',
      detail: 'Open',
    });
    const notification = (
      sendSuperAdminNotification.mock.calls[0] as [string, unknown]
    )[1] as {
      subject: string;
      rows: { label: string; value: string }[];
    };
    expect(notification.subject).toContain('Publication de tournoi');
    expect(notification.rows.map((row) => row.label)).toContain('Détail');
  });

  it('never throws: a failing send or a failing lookup is only logged', async () => {
    sendSuperAdminNotification.mockRejectedValueOnce(new Error('smtp down'));
    await expect(
      service.tournamentPublished({
        tournamentId: 't',
        tournamentName: 'T',
        organizationName: 'O',
      }),
    ).resolves.toBeUndefined();
    // The first recipient failed, the second still got the mail.
    expect(sendSuperAdminNotification).toHaveBeenCalledTimes(2);

    findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.organizationCreated({
        organizationId: 'o',
        organizationName: 'O',
        adminName: 'A',
        adminEmail: 'a@b.c',
      }),
    ).resolves.toBeUndefined();
  });
});
