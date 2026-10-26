import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { adToBsString } from '../src/common/utils/bs-date.js';
import { hashPassword } from '../src/common/utils/password.js';
import { StorageService } from '../src/infra/storage/storage.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
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

const PFX = 'E2E-SCH';
const RUN = Date.now();
const PASSWORD = 'correct-horse-battery';
const V1 = '/api/v1';
const email = (n: string): string => `e2e-sch-${RUN}-${n}@test.local`;
const BS_YEAR = adToBsString('2010-05-05')?.slice(0, 4) ?? '';
const solid = (width: number, height: number) => ({
  create: {
    width,
    height,
    channels: 4 as const,
    background: { r: 200, g: 30, b: 30, alpha: 1 },
  },
});
const png = (w = 300, h = 120): Promise<Buffer> =>
  sharp(solid(w, h)).png().toBuffer();
const jpeg = (w: number, h: number): Promise<Buffer> =>
  sharp(solid(w, h)).jpeg().toBuffer();

describe('School profile and branding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const storage = new FakeStorage();
  let adminToken = '';
  let plainToken = '';
  let original: Awaited<
    ReturnType<PrismaService['schoolProfile']['findUniqueOrThrow']>
  >;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const get = (url: string, t = adminToken) =>
    http().get(`${V1}${url}`).set(auth(t));
  const patch = (body: object, t = adminToken) =>
    http().patch(`${V1}/school/profile`).set(auth(t)).send(body);
  const upload = (
    kind: 'logo' | 'seal',
    data: Buffer,
    t = adminToken,
    name = 'image.png',
  ) =>
    http()
      .put(`${V1}/school/${kind}`)
      .set(auth(t))
      .attach('file', data, { filename: name });

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

    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-sch-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    adminToken = await makeUser('admin', [
      ['school', 'manage'],
      ['students', 'create'],
      ['staff', 'manage'],
    ]);
    plainToken = await makeUser('plain', []);

    await get('/school/profile').expect(200); // makes sure the profile row exists before it is snapshotted
    original = await prisma.schoolProfile.findUniqueOrThrow({
      where: { id: 1 },
    });
  });

  beforeEach(() => {
    storage.failing = false;
  });

  afterAll(async () => {
    // Put the profile back exactly as it was. The version counter stays where it is.
    const {
      id: _id,
      version: _version,
      updatedAt: _updatedAt,
      phones,
      identifiers,
      ...rest
    } = original;
    await prisma.schoolProfile.update({
      where: { id: 1 },
      data: {
        ...rest,
        phones: phones as Prisma.InputJsonValue,
        identifiers: identifiers as Prisma.InputJsonValue,
      },
    });
    await prisma.storedFile.deleteMany({
      where: {
        uploadedById: {
          in: (
            await prisma.user.findMany({
              where: { email: { startsWith: 'e2e-sch-' } },
              select: { id: true },
            })
          ).map((u) => u.id),
        },
      },
    });
    const students = await prisma.student.findMany({
      where: { firstName: { startsWith: PFX } },
      select: { id: true },
    });
    await prisma.student.deleteMany({
      where: { id: { in: students.map((s) => s.id) } },
    });
    await prisma.guardian.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    await prisma.staff.deleteMany({
      where: { firstName: { startsWith: PFX } },
    });
    await prisma.sequence.deleteMany({
      where: { name: `admission:${BS_YEAR}` },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-sch-' } },
    });
    await prisma.role.deleteMany({
      where: { name: { startsWith: `${PFX}-` } },
    });
    await app.close();
  });

  it('lets any signed-in user read the profile, and only managers change it', async () => {
    await http().get(`${V1}/school/profile`).expect(401);
    const res = await get('/school/profile', plainToken).expect(200);
    expect(res.body.data).toMatchObject({
      documentLanguage: 'BOTH',
      nepaliDigits: false,
      admissionNoPrefix: 'ADM',
      staffNoPrefix: 'STF',
    });
    expect(res.body.data.nameEn).toEqual(expect.any(String));
    await patch({ nameEn: 'Hacked' }, plainToken).expect(403);
    await get('/school/profile/history', plainToken).expect(403);
  });

  it('validates profile input', async () => {
    await patch({ nameEn: 'x' }).expect(400);
    await patch({ nameEn: null }).expect(400);
    await patch({ email: 'not-an-email' }).expect(400);
    await patch({ email: '' }).expect(400); // clear with null instead
    await patch({ website: 'http://insecure.example' }).expect(400);
    await patch({ wardNo: 0 }).expect(400);
    await patch({ documentLanguage: 'FR' }).expect(400);
    await patch({ admissionNoPrefix: 'TOO-LONG-PREFIX' }).expect(400);
    await patch({
      phones: [{ label: 'Office', type: 'MOBILE', number: '123' }],
    }).expect(400);
    await patch({
      phones: Array.from({ length: 6 }, () => ({
        label: 'x',
        type: 'OTHER',
        number: '123456',
      })),
    }).expect(400);
    await patch({ establishedOn: '2999-01-01' }).expect(400);
    await patch({
      establishedOn: '2010-05-05',
      establishedOnBs: '2067-01-22',
    }).expect(400);
    await patch({ unknownField: 1 }).expect(400);
    await patch({}).expect(400); // nothing to change
  });

  it('saves a Nepal-style profile and records a version for each change', async () => {
    const before = (await get('/school/profile').expect(200)).body.data
      .version as number;
    const res = await patch({
      nameEn: `${PFX} Secondary School`,
      nameNp: 'श्री माध्यमिक विद्यालय',
      shortName: 'ESS',
      schoolType: 'Institutional',
      establishedOnBs: '2040-01-01',
      province: 'Bagmati',
      district: 'Kathmandu',
      localLevel: 'Kathmandu Metropolitan City',
      wardNo: 10,
      tole: 'Baneshwor',
      addressLineNp: 'काठमाडौं महानगरपालिका, वडा नं. १०',
      postalCode: '44600',
      phones: [
        { label: 'Principal', type: 'MOBILE', number: '9801234567' },
        { label: 'Office', type: 'LANDLINE', number: '01-4123456' },
      ],
      email: 'Office@School.Example',
      website: 'https://school.example',
      identifiers: [
        { labelEn: 'School code', value: 'EMIS-TEST-1', showOnDocuments: true },
        {
          labelEn: 'PAN',
          labelNp: 'स्थायी लेखा नम्बर',
          value: '123456789',
          showOnDocuments: false,
        },
      ],
      documentLanguage: 'BOTH',
      nepaliDigits: true,
    }).expect(200);

    const p = res.body.data;
    expect(p.version).toBe(before + 1);
    expect(p).toMatchObject({
      nameNp: 'श्री माध्यमिक विद्यालय',
      wardNo: 10,
      email: 'office@school.example',
      nepaliDigits: true,
      establishedOnBs: '2040-01-01',
    });
    expect(p.establishedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.phones).toEqual([
      { label: 'Principal', type: 'MOBILE', number: '+9779801234567' }, // mobile normalised
      { label: 'Office', type: 'LANDLINE', number: '01-4123456' }, // landline as typed
    ]);
    expect(p.identifiers).toHaveLength(2);

    await patch({ tole: 'Baneshwor' }).expect(400); // unchanged
    await patch({ tole: null, taglineEn: 'Learn and grow' }).expect(200);
    const cleared = (await get('/school/profile').expect(200)).body.data;
    expect(cleared).toMatchObject({
      tole: null,
      taglineEn: 'Learn and grow',
      version: before + 2,
    });
    await patch({ taglineEn: '' }).expect(200); // an empty string clears plain text too
    expect(
      (await get('/school/profile').expect(200)).body.data.taglineEn,
    ).toBeNull();
  });

  it('keeps an append-only history and logs only the names of changed fields', async () => {
    const list = (await get('/school/profile/history').expect(200)).body
      .data as { version: number; changedByName: string | null }[];
    expect(list[0]?.changedByName).toBe('E2E admin');
    const old = list.find((v) => v.version === (list[0]?.version ?? 0) - 3);
    const snapshot = (
      await get(`/school/profile/history/${old?.version}`).expect(200)
    ).body.data;
    expect(snapshot.profile).toMatchObject({
      nameEn: `${PFX} Secondary School`,
    });
    await get('/school/profile/history/999999').expect(404);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'school.profile_updated' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(audit.details).toMatchObject({ changedFields: ['taglineEn'] });
    expect(JSON.stringify(audit.details)).not.toContain('Learn and grow');
    const row = await prisma.schoolProfileVersion.findFirstOrThrow({
      orderBy: { version: 'desc' },
    });
    await expect(
      prisma.schoolProfileVersion.update({
        where: { version: row.version },
        data: { snapshot: {} },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.schoolProfileVersion.delete({ where: { version: row.version } }),
    ).rejects.toThrow();
  });

  it('uses the configured prefixes for admission and staff numbers', async () => {
    await patch({ admissionNoPrefix: 'sch', staffNoPrefix: 'tch' }).expect(200);
    expect((await get('/school/profile').expect(200)).body.data).toMatchObject({
      admissionNoPrefix: 'SCH',
      staffNoPrefix: 'TCH',
    });

    const student = await http()
      .post(`${V1}/students`)
      .set(auth(adminToken))
      .send({
        firstName: `${PFX}-kid`,
        lastName: 'Rai',
        gender: 'MALE',
        dateOfBirth: '2004-04-04',
        admissionDate: '2010-05-05',
        guardians: [
          {
            firstName: `${PFX}-g`,
            phone: `98${String(RUN).slice(-8)}`,
            relationship: 'FATHER',
            createLogin: false,
          },
        ],
      })
      .expect(201);
    expect(student.body.data.student.admissionNo).toMatch(
      new RegExp(`^SCH-${BS_YEAR}-\\d{3,}$`),
    );

    const staff = await http()
      .post(`${V1}/staff`)
      .set(auth(adminToken))
      .send({
        firstName: `${PFX}-teacher`,
        lastName: 'Rai',
        gender: 'FEMALE',
        kind: 'TEACHING',
        joinDate: '2020-01-01',
      })
      .expect(201);
    expect(staff.body.data.staffNo).toMatch(/^TCH-\d{4,}$/);

    await patch({ admissionNoPrefix: 'ADM', staffNoPrefix: 'STF' }).expect(200);
  });

  it('rejects images that are not safe PNG or JPEG files', async () => {
    const good = await png();
    await upload('logo', good, plainToken).expect(403);
    await http().put(`${V1}/school/logo`).set(auth(adminToken)).expect(400); // no file attached

    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><script>alert(1)</script></svg>',
    );
    await upload('logo', svg, adminToken, 'logo.png').expect(400); // a name saying .png does not matter, the bytes decide
    await upload(
      'logo',
      Buffer.from('GIF89a' + 'x'.repeat(200)),
      adminToken,
      'logo.png',
    ).expect(400);
    await upload(
      'logo',
      Buffer.from('not an image at all'),
      adminToken,
      'logo.png',
    ).expect(400);
    await upload(
      'logo',
      Buffer.concat([good.subarray(0, 40), Buffer.alloc(200, 1)]),
    ).expect(400); // starts like a PNG, but corrupt
    await upload('logo', await png(20, 20)).expect(400); // too small
    await upload('logo', await png(5000, 100)).expect(400); // too wide
    await upload('logo', Buffer.concat([good, Buffer.alloc(1_100_000)])).expect(
      413,
    ); // over 1 MB
    expect(storage.files.size).toBe(0); // nothing reached storage
  });

  it('stores logo and seal as clean, size-limited PNGs and serves them to signed-in users', async () => {
    const uploaded = await upload(
      'logo',
      await jpeg(3000, 1500),
      adminToken,
      'photo.jpg',
    ).expect(200);
    const logo = uploaded.body.data.logo as {
      fileId: string;
      sha256: string;
      width: number;
      height: number;
    };
    expect(logo.width).toBeLessThanOrEqual(1000);
    expect(logo.height).toBe(500); // the 2:1 shape is kept

    const stored = await prisma.storedFile.findUniqueOrThrow({
      where: { id: logo.fileId },
    });
    expect(stored).toMatchObject({
      kind: 'LOGO',
      contentType: 'image/png',
      sha256: logo.sha256,
    });
    expect(
      (await sharp(storage.files.get(stored.objectKey) as Buffer).metadata())
        .format,
    ).toBe('png');

    const res = await get('/school/assets/logo', plainToken).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers.etag).toBe(`"${logo.sha256}"`);
    expect(Buffer.from(res.body as Buffer).length).toBeGreaterThan(0);
    await get('/school/assets/logo')
      .set('If-None-Match', `"${logo.sha256}"`)
      .expect(304);
    await http().get(`${V1}/school/assets/logo`).expect(401);
    await get('/school/assets/banner').expect(400);

    await upload('seal', await png(400, 400)).expect(200);
    expect(
      (await get('/school/profile').expect(200)).body.data.seal,
    ).toMatchObject({ width: 400, height: 400 });
    await get('/school/assets/seal').expect(200);
  });

  it('keeps earlier logos when the logo is replaced or removed, so old versions stay complete', async () => {
    const first = (await get('/school/profile').expect(200)).body.data.logo
      .fileId as string;
    const firstKey = (
      await prisma.storedFile.findUniqueOrThrow({ where: { id: first } })
    ).objectKey;
    const replaced = (await upload('logo', await png(500, 200)).expect(200))
      .body.data.logo.fileId as string;
    expect(replaced).not.toBe(first);
    expect(storage.files.has(firstKey)).toBe(true); // the old file is retained

    const removed = await http()
      .delete(`${V1}/school/logo`)
      .set(auth(adminToken))
      .expect(200);
    expect(removed.body.data.logo).toBeNull();
    await get('/school/assets/logo').expect(404);
    await http().delete(`${V1}/school/logo`).set(auth(adminToken)).expect(404);

    const versions = (await get('/school/profile/history').expect(200)).body
      .data as { version: number }[];
    const withFirst = await prisma.schoolProfileVersion.findFirstOrThrow({
      where: { snapshot: { path: ['logo', 'fileId'], equals: first } },
      orderBy: { version: 'asc' },
    });
    expect(versions.map((v) => v.version)).toContain(withFirst.version);
    expect(
      (withFirst.snapshot as { logo: { fileId: string } }).logo.fileId,
    ).toBe(first);
  });

  it('fails cleanly when storage is down, leaving the profile untouched', async () => {
    const before = (await get('/school/profile').expect(200)).body.data;
    storage.failing = true;
    const res = await upload('seal', await png(300, 300)).expect(503);
    expect(res.body.error.message).toMatch(/unavailable/i);
    expect((await get('/school/profile').expect(200)).body.data).toMatchObject({
      version: before.version,
      seal: before.seal,
    });
    expect(
      await prisma.storedFile.count({ where: { sha256: { not: '' } } }),
    ).toBe(await prisma.storedFile.count());
  });
});
