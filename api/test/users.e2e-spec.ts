import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const email = (name: string): string => `e2e-users-${RUN}-${name}@test.local`;
const MANAGER_PERMISSIONS = [
  ['users', 'read'],
  ['users', 'create'],
  ['users', 'update'],
  ['users', 'assign-roles'],
  ['users', 'reset-password'],
  ['users', 'deactivate'],
] as const;

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let basicRoleId: string;
  let adminRoleId: string;
  let managerToken: string;
  let plainToken: string;
  let adminTargetId: string;
  let managerId: string;

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

  async function login(address: string, password = PASSWORD): Promise<string> {
    const res = await http().post('/api/v1/auth/login').send({ identifier: address, password }).expect(200);
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

    adminRoleId = (await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })).id;
    basicRoleId = (await prisma.role.create({ data: { name: `E2E_BASIC_${RUN}` } })).id;

    const permissions = await prisma.permission.findMany({
      where: { OR: MANAGER_PERMISSIONS.map(([module, action]) => ({ module, action })) },
    });
    if (permissions.length !== MANAGER_PERMISSIONS.length) {
      throw new Error('Permissions missing: run `pnpm prisma db seed` first');
    }
    const managerRole = await prisma.role.create({
      data: {
        name: `E2E_MANAGER_${RUN}`,
        permissions: { create: permissions.map((p) => ({ permissionId: p.id })) },
      },
    });

    managerId = await createUser('manager', [managerRole.id]);
    await createUser('plain', [basicRoleId]);
    adminTargetId = await createUser('admin-target', [adminRoleId]);

    managerToken = await login(email('manager'));
    plainToken = await login(email('plain'));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: `e2e-users-${RUN}` } } });
    await prisma.role.deleteMany({ where: { name: { in: [`E2E_BASIC_${RUN}`, `E2E_MANAGER_${RUN}`] } } });
    await app.close();
  });

  it('requires authentication', async () => {
    await http().get('/api/v1/users').expect(401);
  });

  it('forbids users without the permission', async () => {
    await http().get('/api/v1/users').set(bearer(plainToken)).expect(403);
  });

  it('lists users with pagination metadata and no password hashes', async () => {
    const res = await http()
      .get('/api/v1/users')
      .query({ search: `e2e-users-${RUN}`, pageSize: 2, page: 1 })
      .set(bearer(managerToken))
      .expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('rejects an invalid page size', async () => {
    await http().get('/api/v1/users').query({ pageSize: 1000 }).set(bearer(managerToken)).expect(400);
  });

  it('creates a user with a one-time temporary password and forces a password change', async () => {
    const res = await http()
      .post('/api/v1/users')
      .set(bearer(managerToken))
      .send({ fullName: 'New Teacher', email: email('new'), roleIds: [basicRoleId] })
      .expect(201);
    expect(res.body.data.temporaryPassword).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const token = await login(email('new'), res.body.data.temporaryPassword);
    await http().get('/api/v1/users').set(bearer(token)).expect(403).expect((r) => {
      expect(r.body.error.message).toBe('Password change required');
    });
  });

  it('rejects a duplicate email', async () => {
    await http()
      .post('/api/v1/users')
      .set(bearer(managerToken))
      .send({ fullName: 'Dup', email: email('plain'), roleIds: [basicRoleId] })
      .expect(409);
  });

  it('blocks privilege escalation through role assignment', async () => {
    await http()
      .post('/api/v1/users')
      .set(bearer(managerToken))
      .send({ fullName: 'Sneaky', email: email('sneaky'), roleIds: [adminRoleId] })
      .expect(403);
  });

  it('blocks managing a user who has more permissions than the actor', async () => {
    await http().post(`/api/v1/users/${adminTargetId}/reset-password`).set(bearer(managerToken)).expect(403);
    await http().post(`/api/v1/users/${adminTargetId}/deactivate`).set(bearer(managerToken)).expect(403);
  });

  it('prevents changing own roles or deactivating yourself', async () => {
    await http()
      .put(`/api/v1/users/${managerId}/roles`)
      .set(bearer(managerToken))
      .send({ roleIds: [basicRoleId] })
      .expect(403);
    await http().post(`/api/v1/users/${managerId}/deactivate`).set(bearer(managerToken)).expect(400);
  });

  it('deactivation takes effect immediately and revokes sessions', async () => {
    const created = await http()
      .post('/api/v1/users')
      .set(bearer(managerToken))
      .send({ fullName: 'Leaver', email: email('leaver'), roleIds: [basicRoleId] })
      .expect(201);
    const password = created.body.data.temporaryPassword as string;
    const token = await login(email('leaver'), password);
    await http().get('/api/v1/auth/me').set(bearer(token)).expect(200);

    await http().post(`/api/v1/users/${created.body.data.user.id}/deactivate`).set(bearer(managerToken)).expect(200);
    await http().get('/api/v1/auth/me').set(bearer(token)).expect(401);
    await http().post('/api/v1/auth/login').send({ identifier: email('leaver'), password }).expect(401);
  });

  it('resets a password: old one stops working and the new one forces a change', async () => {
    const created = await http()
      .post('/api/v1/users')
      .set(bearer(managerToken))
      .send({ fullName: 'Forgetful', email: email('forgetful'), roleIds: [basicRoleId] })
      .expect(201);
    const oldPassword = created.body.data.temporaryPassword as string;

    const reset = await http()
      .post(`/api/v1/users/${created.body.data.user.id}/reset-password`)
      .set(bearer(managerToken))
      .expect(200);
    const newPassword = reset.body.data.temporaryPassword as string;
    expect(newPassword).not.toBe(oldPassword);

    await http().post('/api/v1/auth/login').send({ identifier: email('forgetful'), password: oldPassword }).expect(401);
    const login2 = await http().post('/api/v1/auth/login').send({ identifier: email('forgetful'), password: newPassword }).expect(200);
    expect(login2.body.data.user.mustChangePassword).toBe(true);
  });
});