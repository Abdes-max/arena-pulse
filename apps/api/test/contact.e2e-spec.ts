import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/bootstrap-app';
import { resetDatabase } from './utils/reset-database';

const mailService = {
  sendContactMessage: jest.fn().mockResolvedValue(undefined),
};

describe('Contact (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const validPayload = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    subject: 'Question sur les tarifs',
    message: "Bonjour, j'aimerais en savoir plus sur les abonnements.",
  };

  beforeEach(async () => {
    mailService.sendContactMessage.mockClear();
    app = await createTestApp((builder) =>
      builder.overrideProvider(MailService).useValue(mailService),
    );
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterEach(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('sends a valid message without requiring authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/contact')
      .send(validPayload)
      .expect(204);

    expect(mailService.sendContactMessage).toHaveBeenCalledWith(validPayload);
  });

  it('rejects a payload missing required fields', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/contact')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com' })
      .expect(400);

    expect(mailService.sendContactMessage).not.toHaveBeenCalled();
  });

  it('rejects an invalid email address', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/contact')
      .send({ ...validPayload, email: 'not-an-email' })
      .expect(400);

    expect(mailService.sendContactMessage).not.toHaveBeenCalled();
  });
});
