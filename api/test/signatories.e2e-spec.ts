import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { hashPassword } from '../src/common/utils/password.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import { LetterheadService } from '../src/modules/school/letterhead.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

class FakeStorage {
  files = new Map<string, Buffer>();
  failing = false;
  put(key: string, body: Buffer): Promise<void> {
    if (this.failing) return Promise.reject(new Error('storage down'));
    this.files.set(key, body);
    return Promise.resolve();
  }
  get(key: string): Promise<Buffer | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }
  delete(key: string): Promise<void> {
    this.files.delete(key);
    return Promise.resolve();
  }
}

const PFX = 'E2E-SIG';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const LABEL = `${PFX}-${RUN}`;
const email = (n: string): string => `e2e-sig-${RUN}-${n}@test.local`;
const date = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const solid = (w: number, h: number) => ({
  create: {
    width: w,
    height: h,
    channels: 4 as const,
    background: { r: 10, g: 10, b: 120, alpha: 1 },
  },
});
const png = (w = 400, h = 160): Promise<Buffer> =>
  sharp(solid(w, h)).png().toBuffer();
const jpeg = (w: number, h: number): Promise<Buffer> =>
  sharp(solid(w, h)).jpeg().toBuffer();

describe('Signatories, signatures and the letterhead (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let letterhead: LetterheadService;
  const storage = new FakeStorage();
  let adminToken = '';
  let profileOnlyToken = '';
  let plainToken = '';
  let holderA = '';
  let holderB = '';
  let staffId = '';
  let principalOld = '';
  let principalNew = '';

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = adminToken) =>
    http().get(`${V1}${url}`).set(auth(t));
  const post = (url: string, body: object, t = adminToken) =>
    http().post(`${V1}${url}`).set(auth(t)).send(body);
  const patch = (url: string, body: object, t = adminToken) =>
    http().patch(`${V1}${url}`).set(auth(t)).send(body);
  const del = (url: string, t = adminToken) =>
    http().delete(`${V1}${url}`).set(auth(t));
  const upload = (
    url: string,
    data: Buffer,
    t = adminToken,
    name = 'sig.png',
  ) =>
    http()
      .put(`${V1}${url}`)
      .set(auth(t))
      .attach('file', data, { filename: name });
  const other = (suffix: string, extra: object = {}) => ({
    role: 'OTHER',
    roleLabel: `${LABEL}${suffix}`,
    fullNameEn: `${PFX} Person${suffix}`,
    designationEn: 'Chair',
    ...extra,
  });

  async function cleanup(): Promise<void> {
    await prisma.signatory.deleteMany({
      where: { fullNameEn: { startsWith: PFX } },
    });
    const years = await prisma.academicYear.findMany({
      where: { name: { startsWith: PFX } },
      select: { id: true },
    });
    const yearIds = years.map((y) => y.id);
    await prisma.classTeacherAssignment.deleteMany({
      where: { academicYearId: { in: yearIds } },
    });
    await prisma.academicYear.deleteMany({ where: { id: { in: yearIds } } });
    await prisma.section.deleteMany({
      where: { schoolClass: { name: { startsWith: PFX } } },
    });
    await prisma.schoolClass.deleteMany({
      where: { name: { startsWith: PFX } },
    });
    await prisma.staff.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    const users = await prisma.user.findMany({
      where: { email: { startsWith: 'e2e-sig-' } },
      select: { id: true },
    });
    await prisma.storedFile.deleteMany({
      where: { uploadedById: { in: users.map((u) => u.id) } },
    });
  }

  async function makeUser(
    label: string,
    permissions: [string, string][],
  ): Promise<string> {
    const rows = permissions.length
      ? await prisma.permission.findMany({
          where: {
            OR: permissions.map(([module, action]) => ({ module, action })),
          },
        })
      : [];
    if (rows.length !== permissions.length)
      throw new Error('Permissions missing: run `pnpm prisma db seed` first');
    const role = await prisma.role.create({
      data: {
        name: `${PFX}-${RUN}-${label}`,
        permissions: { create: rows.map((p) => ({ permissionId: p.id })) },
      },
    });
    await prisma.user.create({
      data: {
        email: email(label),
        fullName: `E2E ${label}`,
        passwordHash: await hashPassword(PASSWORD),
        roles: { create: [{ roleId: role.id }] },
      },
    });
    const res = await http()
      .post(`${V1}/auth/login`)
      .send({ identifier: email(label), password: PASSWORD })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  const newStaff = (label: string, extra: object = {}) =>
    prisma.staff.create({
      data: {
        staffNo: `E2E-${RUN}-${label}`,
        firstName: `${PFX}-${label}`,
        lastName: 'Teacher',
        gender: 'FEMALE',
        kind: 'TEACHING',
        joinDate: date('2020-01-01'),
        ...extra,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    letterhead = app.get(LetterheadService);

    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-sig-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    adminToken = await makeUser('admin', [['school', 'manage-signatories']]);
    profileOnlyToken = await makeUser('profile', [['school', 'manage']]);
    plainToken = await makeUser('plain', []);
    staffId = (
      await newStaff('linked', {
        designation: 'Senior Teacher',
        fullNameNp: 'वरिष्ठ शिक्षक',
      })
    ).id;
  });

  beforeEach(() => {
    storage.failing = false;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-sig-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('keeps signatory management separate from profile management', async () => {
    for (const t of [plainToken, profileOnlyToken]) {
      await get('/school/signatories', t).expect(403);
      await post(
        '/school/signatories',
        other('-x', { validFrom: '1950-01-01' }),
        t,
      ).expect(403);
      await get('/school/letterhead/preview', t).expect(403);
    }
    await http().get(`${V1}/school/signatories`).expect(401);
    await get('/school/signatories').expect(200);
  });

  it('validates signatories', async () => {
    const bad = (body: object) => post('/school/signatories', body);
    await bad({
      role: 'OTHER',
      fullNameEn: `${PFX} x`,
      designationEn: 'Chair',
      validFrom: '1950-01-01',
    }).expect(400); // OTHER needs a label
    await bad({
      role: 'PRINCIPAL',
      roleLabel: 'Head',
      fullNameEn: `${PFX} x`,
      designationEn: 'P',
      validFrom: '1950-01-01',
    }).expect(400);
    await bad(
      other('-v1', { roleLabel: '<script>', validFrom: '1950-01-01' }),
    ).expect(400);
    await bad(other('-v2')).expect(400); // no start date
    await bad(
      other('-v3', { validFrom: '1950-01-01', validFromBs: '2007-01-01' }),
    ).expect(400); // both calendars
    await bad(
      other('-v4', { validFrom: '1960-01-01', validTo: '1959-01-01' }),
    ).expect(400);
    await bad(
      other('-v5', { validFrom: '1960-01-01', staffId: randomUUID() }),
    ).expect(400);
    await bad(
      other('-v6', { validFrom: '1960-01-01', fullNameEn: undefined }),
    ).expect(400); // no name and no staff
    await bad(
      other('-v7', { validFrom: '1960-01-01', designationEn: undefined }),
    ).expect(400);
    await bad({
      ...other('-v8', { validFrom: '1960-01-01' }),
      mode: 'DIGITAL',
    }).expect(400); // mode cannot be set at creation
  });

  it('creates signatories from BS dates, and ends the previous holder when a new one starts', async () => {
    const a = await post(
      '/school/signatories',
      other('', { validFromBs: '2040-01-01' }),
    ).expect(201);
    holderA = a.body.data.id as string;
    expect(a.body.data).toMatchObject({
      role: 'OTHER',
      mode: 'LINE',
      hasSignature: false,
      validFromBs: '2040-01-01',
      validTo: null,
      isCurrent: true,
    });

    const b = await post(
      '/school/signatories',
      other('', { fullNameEn: `${PFX} Successor`, validFrom: '2020-01-01' }),
    ).expect(201);
    holderB = b.body.data.id as string;
    expect(b.body.data).toMatchObject({
      validFrom: '2020-01-01',
      validTo: null,
      isCurrent: true,
    });
    expect(
      (await get(`/school/signatories/${holderA}`).expect(200)).body.data,
    ).toMatchObject({ validTo: '2019-12-31', isCurrent: false });

    await post(
      '/school/signatories',
      other('', { fullNameEn: `${PFX} Overlap`, validFrom: '2015-01-01' }),
    ).expect(409); // overlaps both
    await post(
      '/school/signatories',
      other('', {
        fullNameEn: `${PFX} Earlier`,
        validFrom: '1960-01-01',
        validTo: '1960-12-31',
      }),
    ).expect(201); // fits before
    const list = (await get('/school/signatories').expect(200)).body.data as {
      slot: string;
    }[];
    expect(
      list.filter((s) => s.slot === `OTHER:${LABEL.toLowerCase()}`),
    ).toHaveLength(3);
  });

  it('is protected by the database even when the service is bypassed', async () => {
    await expect(
      prisma.signatory.create({
        data: {
          role: 'OTHER',
          roleLabel: LABEL,
          slot: `OTHER:${LABEL.toLowerCase()}`,
          fullNameEn: `${PFX} Raw`,
          designationEn: 'Chair',
          validFrom: date('2021-01-01'),
          validTo: date('2021-12-31'),
        },
      }),
    ).rejects.toThrow(); // overlaps the current holder
    await expect(
      prisma.signatory.create({
        data: {
          role: 'OTHER',
          roleLabel: LABEL,
          slot: 'wrong-slot',
          fullNameEn: `${PFX} Raw`,
          designationEn: 'x',
          validFrom: date('1950-01-01'),
        },
      }),
    ).rejects.toThrow(); // slot must match the role
    await expect(
      prisma.signatory.update({
        where: { id: holderB },
        data: { mode: 'DIGITAL' },
      }),
    ).rejects.toThrow(); // digital needs an image
  });

  it('edits signatories and checks the dates again', async () => {
    const url = `/school/signatories/${holderB}`;
    await patch(url, {}).expect(400);
    await patch(url, { designationEn: 'Chair' }).expect(400); // unchanged
    await patch(url, { mode: 'DIGITAL' }).expect(400); // no image yet
    await patch(url, { validFrom: '2010-01-01' }).expect(409); // would overlap the earlier holder
    await patch(url, { validTo: '2019-01-01' }).expect(400); // before its own start
    const res = await patch(url, {
      fullNameNp: 'उत्तराधिकारी',
      designationEn: 'Chairperson',
      validTo: '2030-12-31',
    }).expect(200);
    expect(res.body.data).toMatchObject({
      fullNameNp: 'उत्तराधिकारी',
      designationEn: 'Chairperson',
      validTo: '2030-12-31',
      isCurrent: true,
    });
    expect(
      (await patch(url, { validTo: null }).expect(200)).body.data.validTo,
    ).toBeNull(); // open-ended again
    await patch(`/school/signatories/${randomUUID()}`, {
      fullNameEn: 'x',
    }).expect(404);
  });

  it('copies names from a linked staff member', async () => {
    const res = await post('/school/signatories', {
      role: 'OTHER',
      roleLabel: `${LABEL}-staff`,
      staffId,
      validFrom: '2020-01-01',
    }).expect(201);
    expect(res.body.data).toMatchObject({
      fullNameEn: `${PFX}-linked Teacher`,
      fullNameNp: 'वरिष्ठ शिक्षक',
      designationEn: 'Senior Teacher',
      staffId,
    });
  });

  it('stores an uploaded signature, switches to digital, and guards the image', async () => {
    const url = `/school/signatories/${holderB}/signature`;
    await upload(url, await png(), plainToken).expect(403);
    await upload(
      url,
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    ).expect(400);
    await upload(url, await png(10, 10)).expect(400);
    await upload(
      url,
      Buffer.concat([await png(), Buffer.alloc(600_000)]),
    ).expect(413); // over 512 KB
    await upload(
      `/school/signatories/${randomUUID()}/signature`,
      await png(),
    ).expect(404);
    expect(storage.files.size).toBe(0);

    storage.failing = true;
    await upload(url, await png()).expect(503);
    storage.failing = false;
    expect(
      (await get(`/school/signatories/${holderB}`).expect(200)).body.data.mode,
    ).toBe('LINE'); // nothing changed

    const res = await upload(
      url,
      await jpeg(2400, 1200),
      adminToken,
      'scan.jpg',
    ).expect(200);
    expect(res.body.data).toMatchObject({
      mode: 'DIGITAL',
      hasSignature: true,
    });
    expect(res.body.data.signature.width).toBeLessThanOrEqual(1000);
    const first = res.body.data.signature.fileId as string;

    const bytes = await get(`${url}`).expect(200);
    expect(bytes.headers['content-type']).toContain('image/png');
    expect(bytes.headers['cache-control']).toContain('no-store');
    await get(url, profileOnlyToken).expect(403);
    expect(
      JSON.stringify((await get('/school/signatories').expect(200)).body),
    ).not.toContain('"data"'); // lists carry no image bytes

    await patch(`/school/signatories/${holderB}`, { mode: 'LINE' }).expect(200); // blank line, image kept
    expect(
      (await get(`/school/signatories/${holderB}`).expect(200)).body.data,
    ).toMatchObject({ mode: 'LINE', hasSignature: true });
    await patch(`/school/signatories/${holderB}`, { mode: 'DIGITAL' }).expect(
      200,
    );

    const removed = await del(url).expect(200);
    expect(removed.body.data).toMatchObject({
      mode: 'LINE',
      hasSignature: false,
    });
    await del(url).expect(404);
    await get(url).expect(404);
    const kept = await prisma.storedFile.findUniqueOrThrow({
      where: { id: first },
    });
    expect(storage.files.has(kept.objectKey)).toBe(true); // old documents can still be reproduced
  });

  it("keeps class teachers' signatures on their staff record", async () => {
    const url = `/staff/${staffId}/signature`;
    expect((await get(url).expect(200)).body.data).toMatchObject({
      mode: 'LINE',
      hasSignature: false,
    });
    await get(`/staff/${randomUUID()}/signature`).expect(404);
    await patch(url, { mode: 'DIGITAL' }).expect(400);
    await upload(url, await png(), plainToken).expect(403);
    await upload(`/staff/${randomUUID()}/signature`, await png()).expect(404);

    expect(
      (await upload(url, await png()).expect(200)).body.data,
    ).toMatchObject({ mode: 'DIGITAL', hasSignature: true });
    await get(`${url}/image`).expect(200);
    await get(`${url}/image`, profileOnlyToken).expect(403);
    await patch(url, { mode: 'DIGITAL' }).expect(400); // already digital
    expect(
      (await patch(url, { mode: 'LINE' }).expect(200)).body.data.mode,
    ).toBe('LINE');
    expect((await del(url).expect(200)).body.data).toMatchObject({
      mode: 'LINE',
      hasSignature: false,
    });
    await del(url).expect(404);
    await expect(
      prisma.staff.update({
        where: { id: staffId },
        data: { signatureMode: 'DIGITAL' },
      }),
    ).rejects.toThrow();
  });

  it('picks the signatory in office on the issue date, with the right mode', async () => {
    const old = await post('/school/signatories', {
      role: 'PRINCIPAL',
      fullNameEn: `${PFX} Old Principal`,
      designationEn: 'Principal',
      validFrom: '1960-01-01',
      validTo: '1962-12-31',
    }).expect(201);
    principalOld = old.body.data.id as string;
    const next = await post('/school/signatories', {
      role: 'PRINCIPAL',
      fullNameEn: `${PFX} New Principal`,
      designationEn: 'Principal',
      validFrom: '1963-01-01',
      validTo: '1965-12-31',
    }).expect(201);
    principalNew = next.body.data.id as string;
    await upload(
      `/school/signatories/${principalOld}/signature`,
      await png(),
    ).expect(200);

    const during = await letterhead.assemble({
      asOf: '1961-06-01',
      slots: ['PRINCIPAL'],
    });
    expect(during.signatures).toHaveLength(1);
    expect(during.signatures[0]).toMatchObject({
      slot: 'PRINCIPAL',
      nameEn: `${PFX} Old Principal`,
      mode: 'DIGITAL',
    });
    expect(during.signatures[0]?.image?.data.length).toBeGreaterThan(0);

    const later = await letterhead.assemble({
      asOf: '1964-01-01',
      slots: ['PRINCIPAL'],
    });
    expect(later.signatures[0]).toMatchObject({
      nameEn: `${PFX} New Principal`,
      mode: 'LINE',
      image: null,
    }); // no image: blank line
    const gap = await letterhead.assemble({
      asOf: '1966-06-01',
      slots: ['PRINCIPAL'],
    });
    expect(gap.signatures).toEqual([]);
    expect(gap.warnings.join(' ')).toMatch(
      /No holder of PRINCIPAL was in office on 1966-06-01/,
    );
    expect(typeof during.profileVersion).toBe('number');
  });

  it('forces blank lines when asked, and degrades gracefully when an image is missing', async () => {
    const forced = await letterhead.assemble({
      asOf: '1961-06-01',
      slots: ['PRINCIPAL'],
      signatures: 'line',
    });
    expect(forced.signatures[0]).toMatchObject({ mode: 'LINE', image: null });

    const file = await prisma.signatory.findUniqueOrThrow({
      where: { id: principalOld },
      select: { signatureFile: true },
    });
    const key = file.signatureFile?.objectKey as string;
    const copy = storage.files.get(key) as Buffer;
    storage.files.delete(key); // simulate a lost object
    const degraded = await letterhead.assemble({
      asOf: '1961-06-01',
      slots: ['PRINCIPAL'],
    });
    expect(degraded.signatures[0]).toMatchObject({ mode: 'LINE', image: null });
    expect(degraded.warnings.join(' ')).toMatch(/missing from storage/);
    storage.files.set(key, copy);
  });

  it('resolves the class teacher from the section assignment', async () => {
    const year = await prisma.academicYear.create({
      data: {
        name: `${PFX}-${RUN}-Y`,
        startDate: date('2110-04-01'),
        endDate: date('2111-03-31'),
      },
    });
    const cls = await prisma.schoolClass.create({
      data: { name: `${PFX}-${RUN}-C`, sortOrder: 3 },
    });
    const withTeacher = await prisma.section.create({
      data: { classId: cls.id, name: 'A' },
    });
    const withoutTeacher = await prisma.section.create({
      data: { classId: cls.id, name: 'B' },
    });
    const teacher = await newStaff('ct', { fullNameNp: 'कक्षा शिक्षक नाम' });
    await prisma.classTeacherAssignment.create({
      data: {
        academicYearId: year.id,
        sectionId: withTeacher.id,
        staffId: teacher.id,
      },
    });
    await upload(`/staff/${teacher.id}/signature`, await png()).expect(200);

    const digital = await letterhead.assemble({
      slots: [],
      classTeacher: { academicYearId: year.id, sectionId: withTeacher.id },
    });
    expect(digital.classTeacher).toMatchObject({
      slot: 'CLASS_TEACHER',
      nameEn: `${PFX}-ct Teacher`,
      nameNp: 'कक्षा शिक्षक नाम',
      designationEn: 'Class Teacher',
      mode: 'DIGITAL',
    });
    expect(digital.classTeacher?.image).not.toBeNull();
    const line = await letterhead.assemble({
      slots: [],
      signatures: 'line',
      classTeacher: { academicYearId: year.id, sectionId: withTeacher.id },
    });
    expect(line.classTeacher).toMatchObject({ mode: 'LINE', image: null });
    const none = await letterhead.assemble({
      slots: [],
      classTeacher: { academicYearId: year.id, sectionId: withoutTeacher.id },
    });
    expect(none.classTeacher).toBeNull();
    expect(none.warnings.join(' ')).toMatch(/no class teacher/);
  });

  it('previews what would print, without any image bytes', async () => {
    const res = await get(
      '/school/letterhead/preview?asOf=1961-06-01&slots=PRINCIPAL',
    ).expect(200);
    expect(res.body.data.signatures).toEqual([
      expect.objectContaining({
        slot: 'PRINCIPAL',
        mode: 'DIGITAL',
        hasImage: true,
        sha256: expect.any(String),
      }),
    ]);
    expect(JSON.stringify(res.body.data)).not.toMatch(
      /"data":\[|"type":"Buffer"/,
    );
    expect(res.body.data.school).toMatchObject({
      documentLanguage: expect.any(String),
      identifiers: expect.any(Array),
    });
    expect(
      (
        await get(
          '/school/letterhead/preview?asOf=1961-06-01&slots=PRINCIPAL&signatures=line',
        ).expect(200)
      ).body.data.signatures[0],
    ).toMatchObject({ mode: 'LINE', hasImage: false });
    const byBs = await get(
      '/school/letterhead/preview?asOfBs=2017-09-18&slots=',
    ).expect(200);
    expect(byBs.body.data.signatures).toEqual([]);
    await get('/school/letterhead/preview?asOf=2026-13-40').expect(400);
    await get('/school/letterhead/preview?signatures=maybe').expect(400);
    await get('/school/letterhead/preview?slots=KING').expect(400);
  });

  it('refuses to delete a staff member who is a signatory', async () => {
    const adminUser = await makeUser('staffadmin', [['staff', 'manage']]);
    await http()
      .delete(`${V1}/staff/${staffId}`)
      .set(auth(adminUser))
      .expect(409);
  });
});
