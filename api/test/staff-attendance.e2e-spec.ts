import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { todayIso } from '../src/common/utils/bs-date.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Staff attendance API', () => {
  let app: INestApplication;
  let db: PrismaService;
  const tag = randomUUID();
  const ids: string[] = [];
  let admin: string, employee: string, parent: string;
  let substitute: string;
  const base = '/api/v1/staff-attendance';
  const auth = (token: string) => ({ Authorization: 'Bearer ' + token });
  const day = todayIso();
  const policy = {
    name: 'E2E campus',
    latitude: 27.7,
    longitude: 85.3,
    radius: 100,
    startsAt: '09:00',
    endsAt: '17:00',
    grace: 5,
    offDays: [6],
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const jwt = app.get(JwtService);
    async function account(label: string, kind?: 'TEACHING' | 'NON_TEACHING') {
      const user = await db.user.create({
        data: {
          fullName: label,
          email: tag + '-' + label + '@example.test',
          passwordHash: 'unused',
          mustChangePassword: false,
          roles:
            label === 'admin'
              ? { create: { role: { connect: { name: 'ADMIN' } } } }
              : undefined,
        },
      });
      ids.push(user.id);
      if (kind)
        await db.staff.create({
          data: {
            userId: user.id,
            kind,
            gender: 'OTHER',
            staffNo: tag + label,
            firstName: label,
            lastName: 'Test',
            joinDate: new Date('2020-01-01'),
          },
        });
      return jwt.signAsync({ sub: user.id });
    }
    admin = await account('admin', 'TEACHING');
    employee = await account('employee', 'NON_TEACHING');
    substitute = await account('substitute', 'TEACHING');
    parent = await account('unlinked');
  });
  afterAll(async () => {
    if (db && ids.length) {
      const staff = await db.staff.findMany({
        where: { userId: { in: ids } },
        select: { id: true },
      });
      const scope = { staffId: { in: staff.map((s) => s.id) } };
      await db.staffPunch.deleteMany({ where: scope });
      await db.staffAttendanceRequest.deleteMany({ where: scope });
      await db.staffAttendancePolicy.deleteMany({
        where: { createdBy: { in: ids } },
      });
      await db.staff.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    await app?.close();
  });

  it('checks permissions and records one server timestamp per daily punch', async () => {
    const http = request(app.getHttpServer());
    await http
      .get(base + '/me')
      .set(auth(parent))
      .expect(403);
    await http
      .get(base + '/register')
      .set(auth(employee))
      .expect(403);
    await http
      .put(base + '/policy')
      .set(auth(employee))
      .send(policy)
      .expect(403);
    await http
      .put(base + '/policy')
      .set(auth(admin))
      .send(policy)
      .expect(200);
    const fix = {
      latitude: policy.latitude,
      longitude: policy.longitude,
      accuracy: 5,
      capturedAt: Date.now(),
      workDate: day,
      kind: 'IN',
    };
    const punch = (body: object) =>
      http
        .post(base + '/me/punches')
        .set(auth(employee))
        .send(body);
    await punch({ ...fix, kind: 'OUT' }).expect(409);
    await punch({ ...fix, latitude: 28 }).expect(400);
    await punch({ ...fix, at: new Date().toISOString() }).expect(400);
    const first = await punch(fix).expect(201);
    expect(Date.parse(first.body.data.at)).toBeGreaterThanOrEqual(
      fix.capturedAt - 1000,
    );
    expect((await punch(fix).expect(201)).body.data.id).toBe(
      first.body.data.id,
    );
    await punch({ ...fix, kind: 'OUT' }).expect(201);
    const register = await http
      .get(base + '/register')
      .set(auth(admin))
      .expect(200);
    expect(register.body.data).toContainEqual(
      expect.objectContaining({
        staffNo: tag + 'employee',
        status: 'Checked out',
      }),
    );
  });

  it('records the approved correction time and preserves the approval trail', async () => {
    const http = request(app.getHttpServer());
    await http
      .put(base + '/policy')
      .set(auth(admin))
      .send(policy)
      .expect(200);
    const proposedAt = new Date().toISOString();
    const row = await http
      .post(base + '/me/requests')
      .set(auth(substitute))
      .send({
        kind: 'MISSED_IN',
        fromDate: day,
        toDate: day,
        proposedAt,
        reason: 'Location unavailable',
      })
      .expect(201);
    const path = base + '/requests/' + row.body.data.id + '/decision';
    const decision = { status: 'APPROVED', note: 'Verified at reception' };
    await http.post(path).set(auth(admin)).send(decision).expect(201);
    await http.post(path).set(auth(admin)).send(decision).expect(409);
    const history = await http
      .get(base + '/me')
      .set(auth(substitute))
      .expect(200);
    expect(history.body.data.punches[0]).toMatchObject({
      at: proposedAt,
      kind: 'IN',
      requestId: row.body.data.id,
    });
    expect(history.body.data.requests[0]).toMatchObject({
      status: 'APPROVED',
      reviewNote: decision.note,
    });
  });

  it('applies approved leave to the register and blocks conflicting punches', async () => {
    const http = request(app.getHttpServer());
    const row = await http
      .post(base + '/me/requests')
      .set(auth(admin))
      .send({
        kind: 'LEAVE',
        fromDate: day,
        toDate: day,
        reason: 'Personal leave',
      })
      .expect(201);
    const path = base + '/requests/' + row.body.data.id + '/decision';
    const decision = { status: 'APPROVED', note: 'Approved by office' };
    await http.post(path).set(auth(admin)).send(decision).expect(403);
    const user = await db.user.create({
      data: {
        fullName: 'Second reviewer',
        email: tag + '-reviewer@example.test',
        passwordHash: 'unused',
        mustChangePassword: false,
        roles: { create: { role: { connect: { name: 'ADMIN' } } } },
      },
    });
    ids.push(user.id);
    const token = await app.get(JwtService).signAsync({ sub: user.id });
    await http.post(path).set(auth(token)).send(decision).expect(201);
    await http
      .post(base + '/me/punches')
      .set(auth(admin))
      .send({
        kind: 'IN',
        workDate: day,
        latitude: 27.7,
        longitude: 85.3,
        accuracy: 5,
        capturedAt: Date.now(),
      })
      .expect(409);
    const register = await http
      .get(base + '/register')
      .set(auth(token))
      .expect(200);
    expect(register.body.data).toContainEqual(
      expect.objectContaining({ staffNo: tag + 'admin', status: 'On leave' }),
    );
  });
});
