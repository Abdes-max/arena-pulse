import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './utils/bootstrap-app';

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  it('/api/v1/health (GET) reports the database as up, without authentication', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          status: string;
          info: { database: { status: string } };
        };
        expect(body.status).toBe('ok');
        expect(body.info.database.status).toBe('up');
      });
  });

  it('echoes a supplied x-request-id back on the response', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .set('x-request-id', 'test-request-id-123')
      .expect(200)
      .expect('x-request-id', 'test-request-id-123');
  });

  it('generates a x-request-id when the client did not supply one', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.headers['x-request-id']).toBeTruthy();
      });
  });

  it('unmatched routes still return a JSON error body carrying the requestId, unchanged status/shape', () => {
    return request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .expect(404)
      .expect((res) => {
        const body = res.body as {
          statusCode: number;
          message: string;
          requestId: string;
        };
        expect(body.statusCode).toBe(404);
        expect(typeof body.message).toBe('string');
        expect(body.requestId).toBeTruthy();
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
