import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { sha256 } from '../src/common/utils/hash.js';
import { hashPassword } from '../src/common/utils/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const EMAIL = `e2e-auth-${Date.now()}@test.local`;
const PASSWORD = 'correct-horse-battery';
const COOKIE = 'refresh_token';
const API = '/api/v1/auth';

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const header = res.headers['set-cookie'] as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith(`${COOKIE}=`));
  if (!cookie) throw new Error('refresh cookie was not set');
  return cookie.split(';')[0] as string;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: { email: EMAIL, passwordHash: await hashPassword(PASSWORD), fullName: 'E2E Auth' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await app.close();
  });

  const login = (password = PASSWORD) =>
    request(app.getHttpServer()).post(`${API}/login`).send({ identifier: EMAIL, password });

  it('rejects protected routes without a token', async () => {
    await request(app.getHttpServer()).get(`${API}/me`).expect(401);
  });

  it('rejects a wrong password and an unknown account with the same error', async () => {
    const wrong = await login('wrong-password-123').expect(401);
    const unknown = await request(app.getHttpServer())
      .post(`${API}/login`)
      .send({ identifier: 'nobody@test.local', password: PASSWORD })
      .expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('logs in, sets an HttpOnly refresh cookie, and exposes the user without secrets', async () => {
    const res = await login().expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(EMAIL);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${COOKIE}=`));
    expect(raw).toContain('HttpOnly');
    expect(raw?.toLowerCase()).toContain('samesite=strict');

    const me = await request(app.getHttpServer())
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.email).toBe(EMAIL);
  });

  it('rotates the refresh token and rejects the old one', async () => {
    const first = cookieFrom(await login().expect(200));
    const refreshed = await request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', first).expect(200);
    const second = cookieFrom(refreshed);
    expect(second).not.toBe(first);
    await request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', first).expect(401);
  });

  it('revokes the whole family when an old token is replayed after the grace window', async () => {
    const first = cookieFrom(await login().expect(200));
    const second = cookieFrom(
      await request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', first).expect(200),
    );

    // Pretend the first token was rotated a minute ago.
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(first.slice(COOKIE.length + 1)) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    await request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', first).expect(401);
    await request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', second).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const cookie = cookieFrom(await login().expect(200));
    await request(app.getHttpServer()).post(`${API}/logout`).set('Cookie', cookie).expect(200);
    await request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', cookie).expect(401);
  });

  it('stops honouring access tokens as soon as the user is deactivated', async () => {
    const res = await login().expect(200);
    const token = res.body.data.accessToken as string;
    await request(app.getHttpServer()).get(`${API}/me`).set('Authorization', `Bearer ${token}`).expect(200);

    await prisma.user.update({ where: { email: EMAIL }, data: { isActive: false } });
    await request(app.getHttpServer()).get(`${API}/me`).set('Authorization', `Bearer ${token}`).expect(401);
    await prisma.user.update({ where: { email: EMAIL }, data: { isActive: true } });
  });

  it('changes the password, revokes sessions, and requires the new password', async () => {
    const res = await login().expect(200);
    const token = res.body.data.accessToken as string;
    const cookie = cookieFrom(res);

    await request(app.getHttpServer())
      .post(`${API}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'not-the-password', newPassword: 'another-long-password' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/change-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'another-long-password' })
      .expect(200);

    await request(app.getHttpServer()).post(`${API}/refresh`).set('Cookie', cookie).expect(401);
    await login(PASSWORD).expect(401);
    await login('another-long-password').expect(200);
  });
});