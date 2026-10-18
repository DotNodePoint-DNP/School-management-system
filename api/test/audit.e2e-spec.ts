import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { AuditService } from '../src/modules/audit-logs/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const email = (name: string): string => `e2e-audit-${RUN}-${name}@test.local`;

describe('Audit logs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;
  let managerId: string;
  let managerToken: string;
  let plainToken: string;
  let basicRoleId: string;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createUser(name: string, roleIds: string[]): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: email(name),
        fullName: `E2E ${name}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: roleIds.map((roleId) => ({ roleId })) },
      },
    });
    return user.id;
  }

  async function login(address: string): Promise<string> {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ identifier: address, password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);

    const perms = await prisma.permission.findMany({
      where: {
        OR: [
          { module: 'audit-logs', action: 'read' },
          { module: 'users', action: 'create' },
        ],
      },
    });
    if (perms.length !== 2)
      throw new Error('Permissions missing: run `pnpm prisma db seed` first');

    const managerRole = await prisma.role.create({
      data: {
        name: `E2E_AUDIT_MANAGER_${RUN}`,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
    });
    basicRoleId = (
      await prisma.role.create({ data: { name: `E2E_AUDIT_BASIC_${RUN}` } })
    ).id;

    managerId = await createUser('manager', [managerRole.id]);
    await createUser('plain', []);
    managerToken = await login(email('manager'));
    plainToken = await login(email('plain'));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: `e2e-audit-${RUN}` } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `E2E_AUDIT_` } },
    });
    await app.close();
  });

  it('requires audit-logs:read', async () => {
    await http().get('/api/v1/audit-logs').expect(401);
    await http().get('/api/v1/audit-logs').set(bearer(plainToken)).expect(403);
  });

  it('records a successful login with IP and user agent', async () => {
    const res = await http()
      .get('/api/v1/audit-logs')
      .query({ actorId: managerId, action: 'auth.login' })
      .set(bearer(managerToken))
      .expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toMatchObject({
      action: 'auth.login',
      actorName: 'E2E manager',
      entityId: managerId,
    });
    expect(res.body.data[0].ipAddress).toEqual(expect.any(String));
  });

  it('records a failed login without storing the password', async () => {
    const wrong = 'wrong-password-xyz-123';
    await http()
      .post('/api/v1/auth/login')
      .send({ identifier: email('plain'), password: wrong })
      .expect(401);

    const row = await prisma.auditLog.findFirst({
      where: {
        action: 'auth.login_failed',
        details: { path: ['identifier'], equals: email('plain') },
      },
    });
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(wrong);
    expect(row?.details).toMatchObject({ reason: 'bad_password' });
  });

  it('records user creation without leaking the temporary password', async () => {
    const created = await http()
      .post('/api/v1/users')
      .set(bearer(managerToken))
      .send({
        fullName: 'Audited User',
        email: email('audited'),
        roleIds: [basicRoleId],
      })
      .expect(201);
    const tempPassword = created.body.data.temporaryPassword as string;
    const userId = created.body.data.user.id as string;

    const res = await http()
      .get('/api/v1/audit-logs')
      .query({ entityType: 'user', entityId: userId })
      .set(bearer(managerToken))
      .expect(200);
    expect(res.body.data[0]).toMatchObject({
      action: 'user.created',
      actorId: managerId,
    });
    expect(JSON.stringify(res.body)).not.toContain(tempPassword);
  });

  it('redacts sensitive keys in details', async () => {
    const marker = `redaction-${RUN}`;
    await audit.record({
      action: 'user.updated',
      entityType: 'test',
      entityId: marker,
      details: {
        password: 'hunter2',
        nested: { refreshToken: 'abc', safe: 'ok' },
      },
    });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'test', entityId: marker },
    });
    expect(row.details).toEqual({
      password: '[redacted]',
      nested: { refreshToken: '[redacted]', safe: 'ok' },
    });
  });

  it('pages through logs with a cursor', async () => {
    const first = await http()
      .get('/api/v1/audit-logs')
      .query({ limit: 1 })
      .set(bearer(managerToken))
      .expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.meta.nextCursor).toEqual(expect.any(String));

    const second = await http()
      .get('/api/v1/audit-logs')
      .query({ limit: 1, cursor: first.body.meta.nextCursor })
      .set(bearer(managerToken))
      .expect(200);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  });

  it('rejects an unknown action filter', async () => {
    await http()
      .get('/api/v1/audit-logs')
      .query({ action: 'made.up' })
      .set(bearer(managerToken))
      .expect(400);
  });

  it('cannot be edited or deleted, even directly in the database', async () => {
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { actorId: managerId },
    });
    await expect(
      prisma.auditLog.update({
        where: { id: row.id },
        data: { action: 'user.created' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.auditLog.delete({ where: { id: row.id } }),
    ).rejects.toThrow();
  });
});
