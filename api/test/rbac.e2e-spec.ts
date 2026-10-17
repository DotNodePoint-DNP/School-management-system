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
const P = `E2E_RBAC_${RUN}`;
const email = (name: string): string => `e2e-rbac-${RUN}-${name}@test.local`;

describe('RBAC roles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let managerToken: string;
  let plainToken: string;
  let powerRoleId: string;
  let adminRoleId: string;
  let teacherRoleId: string;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  const permissionRows = (codes: string[]) =>
    prisma.permission.findMany({
      where: {
        OR: codes.map((code) => {
          const [module, action] = code.split(':') as [string, string];
          return { module, action };
        }),
      },
    });

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

  async function createRole(
    name: string,
    permissions: string[],
  ): Promise<string> {
    const res = await http()
      .post('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .send({ name: `${P}_${name}`, permissions })
      .expect(201);
    return res.body.data.id as string;
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

    adminRoleId = (
      await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })
    ).id;
    teacherRoleId = (
      await prisma.role.findUniqueOrThrow({ where: { name: 'TEACHER' } })
    ).id;

    const managerPerms = await permissionRows([
      'roles:read',
      'roles:manage',
      'users:read',
    ]);
    const powerPerms = await permissionRows(['users:create']);
    if (managerPerms.length !== 3 || powerPerms.length !== 1) {
      throw new Error('Permissions missing: run `pnpm prisma db seed` first');
    }
    const managerRole = await prisma.role.create({
      data: {
        name: `${P}_MANAGER`,
        permissions: {
          create: managerPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    powerRoleId = (
      await prisma.role.create({
        data: {
          name: `${P}_POWER`,
          permissions: {
            create: powerPerms.map((p) => ({ permissionId: p.id })),
          },
        },
      })
    ).id;

    await createUser('manager', [managerRole.id]);
    await createUser('plain', []);
    managerToken = await login(email('manager'));
    plainToken = await login(email('plain'));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: `e2e-rbac-${RUN}` } },
    });
    await prisma.role.deleteMany({ where: { name: { startsWith: P } } });
    await app.close();
  });

  it('requires roles:read to list roles', async () => {
    await http().get('/api/v1/rbac/roles').set(bearer(plainToken)).expect(403);
    await http()
      .get('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .expect(200);
  });

  it('creates a role from permissions the actor holds', async () => {
    const res = await http()
      .post('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .send({
        name: `${P}_Reader`,
        description: 'Can view users',
        permissions: ['users:read'],
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: `${P}_Reader`,
      isSystem: false,
      userCount: 0,
      permissions: ['users:read'],
    });
  });

  it('refuses to grant permissions the actor does not hold', async () => {
    await http()
      .post('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .send({ name: `${P}_Sneaky`, permissions: ['users:create'] })
      .expect(403);
  });

  it('rejects unknown permission codes and bad names', async () => {
    await http()
      .post('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .send({ name: `${P}_Unknown`, permissions: ['nothing:here'] })
      .expect(403); // actor does not hold it, so it is refused before lookup
    await http()
      .post('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .send({ name: '!', permissions: [] })
      .expect(400);
    await http()
      .post('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .send({ name: `${P}_X`, permissions: ['BAD CODE'] })
      .expect(400);
  });

  it('rejects a duplicate role name regardless of case', async () => {
    await createRole('Dup', []);
    await http()
      .post('/api/v1/rbac/roles')
      .set(bearer(managerToken))
      .send({ name: `${P}_dup`.toLowerCase(), permissions: [] })
      .expect(409);
  });

  it('protects system roles and ADMIN permissions', async () => {
    await http()
      .patch(`/api/v1/rbac/roles/${teacherRoleId}`)
      .set(bearer(managerToken))
      .send({ name: 'Hacked' })
      .expect(403);
    await http()
      .delete(`/api/v1/rbac/roles/${teacherRoleId}`)
      .set(bearer(managerToken))
      .expect(403);
    await http()
      .put(`/api/v1/rbac/roles/${adminRoleId}/permissions`)
      .set(bearer(managerToken))
      .send({ permissions: [] })
      .expect(403);
  });

  it('refuses to edit or delete a role that holds permissions the actor lacks', async () => {
    await http()
      .patch(`/api/v1/rbac/roles/${powerRoleId}`)
      .set(bearer(managerToken))
      .send({ description: 'x' })
      .expect(403);
    await http()
      .put(`/api/v1/rbac/roles/${powerRoleId}/permissions`)
      .set(bearer(managerToken))
      .send({ permissions: [] })
      .expect(403);
    await http()
      .delete(`/api/v1/rbac/roles/${powerRoleId}`)
      .set(bearer(managerToken))
      .expect(403);
  });

  it('cannot delete a role that is assigned to users, but can delete an unused one', async () => {
    const inUse = await createRole('InUse', []);
    await createUser('holder', [inUse]);
    await http()
      .delete(`/api/v1/rbac/roles/${inUse}`)
      .set(bearer(managerToken))
      .expect(409);

    const unused = await createRole('Unused', []);
    await http()
      .delete(`/api/v1/rbac/roles/${unused}`)
      .set(bearer(managerToken))
      .expect(200);
    await http()
      .get(`/api/v1/rbac/roles/${unused}`)
      .set(bearer(managerToken))
      .expect(404);
  });

  it('applies permission changes immediately to users who already have a token', async () => {
    const roleId = await createRole('Live', ['users:read']);
    await createUser('live-user', [roleId]);
    const token = await login(email('live-user'));
    await http().get('/api/v1/users').set(bearer(token)).expect(200);

    await http()
      .put(`/api/v1/rbac/roles/${roleId}/permissions`)
      .set(bearer(managerToken))
      .send({ permissions: [] })
      .expect(200);
    await http().get('/api/v1/users').set(bearer(token)).expect(403);
  });
});
