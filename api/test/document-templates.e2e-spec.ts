import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('School document issuance', () => {
  let app: INestApplication, db: PrismaService, token: string, plain: string;
  let year: string,
    section: string,
    schoolClass: string,
    student: string,
    enrollment: string,
    template: string,
    letterId: string;
  const tag = randomUUID(),
    prefix = 'T' + tag.slice(0, 8);
  const url = '/api/v1/documents';
  const post = (path: string, body: unknown, access = token) =>
    request(app.getHttpServer())
      .post(url + path)
      .set('Authorization', 'Bearer ' + access)
      .send(body as object);
  const layout = {
    orientation: 'landscape',
    prefix,
    serialYear: 'BS',
    nepaliDigits: true,
    printArt: true,
    blocks: [
      {
        type: 'text',
        side: 'front',
        text: '{{name}} · {{issueBs}} · {{serial}}',
        x: 2,
        y: 2,
        width: 80,
        height: 15,
        points: 10,
        color: '#000000',
        bold: false,
        align: 'left',
        required: true,
      },
    ],
  };
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const admin = await db.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
    for (const privileged of [true, false]) {
      const u = await db.user.create({
        data: {
          email: tag + privileged + '@example.invalid',
          passwordHash: 'unused',
          fullName: tag,
          mustChangePassword: false,
          ...(privileged ? { roles: { create: { roleId: admin.id } } } : {}),
        },
      });
      const jwt = await app.get(JwtService).signAsync({ sub: u.id });
      if (privileged) token = jwt;
      else plain = jwt;
    }
    year = (
      await db.academicYear.create({
        data: {
          name: tag,
          startDate: new Date('2150-01-01'),
          endDate: new Date('2150-12-31'),
        },
      })
    ).id;
    schoolClass = (
      await db.schoolClass.create({ data: { name: tag, sortOrder: 900 } })
    ).id;
    section = (
      await db.section.create({ data: { name: 'A', classId: schoolClass } })
    ).id;
    student = (
      await db.student.create({
        data: {
          firstName: 'Sita',
          lastName: 'Shrestha',
          admissionNo: prefix,
          gender: 'FEMALE',
          dateOfBirth: new Date('2011-01-01'),
          admissionDate: new Date('2021-02-01'),
        },
      })
    ).id;
    enrollment = (
      await db.enrollment.create({
        data: {
          studentId: student,
          academicYearId: year,
          classId: schoolClass,
          sectionId: section,
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (db) {
      const where = {
        batch: {
          version: { templateId: { in: [template ?? tag, letterId ?? tag] } },
        },
      };
      await db.documentIssue.deleteMany({
        where: { ...where, replacesId: { not: null } },
      });
      await db.documentIssue.deleteMany({ where });
      await db.documentBatch.deleteMany({
        where: {
          version: { templateId: { in: [template ?? tag, letterId ?? tag] } },
        },
      });
      await db.documentVersion.deleteMany({
        where: { templateId: { in: [template ?? tag, letterId ?? tag] } },
      });
      await db.documentTemplate.deleteMany({
        where: { id: { in: [template ?? tag, letterId ?? tag] } },
      });
      await db.sequence.deleteMany({
        where: { name: { startsWith: 'documents:' + prefix + '-' } },
      });
      await db.enrollment.deleteMany({ where: { id: enrollment ?? tag } });
      await db.student.deleteMany({ where: { id: student ?? tag } });
      await db.section.deleteMany({ where: { id: section ?? tag } });
      await db.schoolClass.deleteMany({ where: { id: schoolClass ?? tag } });
      await db.academicYear.deleteMany({ where: { id: year ?? tag } });
      await db.user.deleteMany({ where: { fullName: tag } });
    }
    await app?.close();
  });
  it('validates drafts, checks rights and proof freshness, issues once on a concurrent retry, and preserves corrected originals', async () => {
    const draft = { title: tag, kind: 'ID_CARD', layout };
    await post('/templates', draft, plain).expect(403);
    await post('/templates', {
      ...draft,
      layout: { ...layout, blocks: [{ ...layout.blocks[0], x: 80 }] },
    }).expect(400);
    template = (await post('/templates', draft).expect(201)).body.data.id;
    const versionId = (
      await post('/templates/' + template + '/publish', { revision: 1 }).expect(
        201,
      )
    ).body.data.id;
    const input = {
      versionId,
      enrollmentIds: [enrollment, randomUUID()],
      signed: false,
    };
    const preview = async (body: object) =>
      (await post('/preview', body).expect(201)).body.data;
    const initial = await preview(input);
    expect(initial.skipped).toHaveLength(1);
    await db.student.update({
      where: { id: student },
      data: { firstName: 'Rita' },
    });
    await post('/issue', {
      ...input,
      proof: initial.proof,
      requestId: randomUUID(),
    }).expect(409);
    const ready = await preview(input);
    const req = { ...input, requestId: randomUUID(), proof: ready.proof };
    const [one, two] = await Promise.all([
      post('/issue', req).expect(201),
      post('/issue', req).expect(201),
    ]);
    const first = one.body.data.documents[0].values;
    expect(first.serial).toMatch(/-00001$/);
    expect(two.body.data.documents[0].values.serial).toBe(first.serial);
    expect(first.issueBs).toMatch(/[०-९]/);
    const original = await db.documentIssue.findUniqueOrThrow({
      where: { serial: first.serial },
    });
    await db.student.update({
      where: { id: student },
      data: { firstName: 'Pratima' },
    });
    const correction = {
      ...input,
      enrollmentIds: [enrollment],
      replacesId: original.id,
      reason: 'Corrected name',
    };
    const corrected = await preview(correction);
    const result = await post('/issue', {
      ...correction,
      proof: corrected.proof,
      requestId: randomUUID(),
    }).expect(201);
    expect(result.body.data.documents[0].values.name).toBe('Pratima Shrestha');
    expect(result.body.data.documents[0].values.serial).toMatch(/-00002$/);
    const copy = await request(app.getHttpServer())
      .get(url + '/register/' + original.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(copy.body.data.documents[0].values).toEqual(first);
    await post('/preview', correction).expect(400);
  });
  it('issues letters to a recipient with an optional student and preserves the approved wording on reprint', async () => {
    const letter = { subject: 'Recommendation', body: 'From {{schoolEn}}' };
    const draft = {
      kind: 'OFFICIAL_LETTER',
      title: tag + ' office',
      layout: { ...layout, orientation: 'portrait', blocks: [], letter },
    };
    letterId = (await post('/templates', draft).expect(201)).body.data.id;
    const versionId = (
      await post('/templates/' + letterId + '/publish', { revision: 1 }).expect(
        201,
      )
    ).body.data.id;
    const input = {
      versionId,
      enrollmentIds: [],
      signed: false,
      letter: { ...letter, recipient: 'Ward Office' },
    };
    const proof = (await post('/preview', input).expect(201)).body.data.proof;
    await post('/issue', {
      ...input,
      letter: { ...input.letter, recipient: 'Changed' },
      proof,
      requestId: randomUUID(),
    }).expect(409);
    const issued = (
      await post('/issue', { ...input, proof, requestId: randomUUID() }).expect(
        201,
      )
    ).body.data;
    expect(issued.documents[0]).toMatchObject({
      enrollmentId: null,
      values: { recipient: 'Ward Office', body: letter.body },
    });
    const row = await db.documentIssue.findUniqueOrThrow({
      where: { serial: issued.documents[0].values.serial },
    });
    const copy = await request(app.getHttpServer())
      .get(url + '/register/' + row.id)
      .set('Authorization', 'Bearer ' + token)
      .expect(200);
    expect(copy.body.data.documents).toEqual(issued.documents);
    const revised = {
      ...input,
      replacesId: row.id,
      reason: 'Updated subject',
      letter: { ...input.letter, subject: 'Revised' },
    };
    const revision = (await post('/preview', revised).expect(201)).body.data
      .proof;
    await post('/issue', {
      ...revised,
      proof: revision,
      requestId: randomUUID(),
    }).expect(201);
    const personal = {
      ...input,
      letter: { ...input.letter, body: 'Student {{name}}' },
    };
    await post('/preview', personal).expect(400);
    const linked = (
      await post('/preview', {
        ...personal,
        enrollmentIds: [enrollment],
      }).expect(201)
    ).body.data;
    expect(linked.documents[0].enrollmentId).toBe(enrollment);
  });
});
