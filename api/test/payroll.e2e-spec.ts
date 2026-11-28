import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { monthBounds } from '../src/modules/payroll/payroll-calculations.js';
import { addDaysIso, toIsoDate } from '../src/common/utils/bs-date.js';

describe('Staff payroll and disbursement reports', () => {
  let app: INestApplication, db: PrismaService, token: string, plain: string;
  const tag = randomUUID();
  const people: string[] = [];
  const users: string[] = [];
  const month = '2050-02';
  const dates = monthBounds(month);
  const last = toIsoDate(dates.endDate),
    next = addDaysIso(last, 1);
  const base = '/api/v1/payroll',
    period = base + '/periods/' + month;
  const http = () => request(app.getHttpServer());
  const get = (p: string) => http().get(p).auth(token, { type: 'bearer' });
  const post = (p: string, data: object = {}) =>
    http().post(p).auth(token, { type: 'bearer' }).send(data);
  const put = (p: string, data: object) =>
    http().put(p).auth(token, { type: 'bearer' }).send(data);
  let createdPeriod: string | undefined;
  let secondPeriod: string | undefined;
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    // This integration test owns an otherwise unused historical register in the test database.
    if (
      (await db.payrollPeriod.count({ where: { month } })) ||
      (await db.staff.count({
        where: {
          joinDate: { lte: dates.endDate },
          OR: [{ leftOn: null }, { leftOn: { gte: dates.startDate } }],
        },
      }))
    )
      throw new Error('Payroll test needs an unused historical register.');
    const jwt = app.get(JwtService);
    for (const admin of [true, false]) {
      const user = await db.user.create({
        data: {
          email: randomUUID() + '@example.test',
          fullName: 'Payroll test',
          passwordHash: 'unused',
          mustChangePassword: false,
          roles: admin
            ? { create: { role: { connect: { name: 'ADMIN' } } } }
            : undefined,
        },
      });
      users.push(user.id);
      const signed = await jwt.signAsync({ sub: user.id });
      if (admin) token = signed;
      else plain = signed;
    }
    for (const kind of ['TEACHING', 'NON_TEACHING'] as const) {
      const partial = kind === 'NON_TEACHING';
      const staff = await db.staff.create({
        data: {
          staffNo: tag + kind,
          firstName: 'Payroll',
          lastName: kind,
          gender: 'OTHER',
          kind,
          joinDate: dates.startDate,
          status: partial ? 'LEFT' : 'ACTIVE',
          leftOn: partial ? dates.startDate : null,
        },
      });
      people.push(staff.id);
    }
  });
  afterAll(async () => {
    if (db) {
      if (secondPeriod) {
        await db.payrollPayment.deleteMany({where:{entry:{periodId:secondPeriod}}});
        await db.payrollEntry.deleteMany({where:{periodId:secondPeriod}});
        await db.payrollPeriod.delete({where:{id:secondPeriod}});
      }
      if (createdPeriod) {
        await db.payrollPayment.deleteMany({
          where: { entry: { periodId: createdPeriod } },
        });
        await db.payrollAdjustment.deleteMany({where:{entry:{periodId:createdPeriod}}});
        await db.salaryAdvance.deleteMany({where:{staffId:{in:people}}});
        await db.payrollEntry.deleteMany({
          where: { periodId: createdPeriod },
        });
        await db.payrollPeriod.delete({ where: { id: createdPeriod } });
      }
      await db.staffSalaryRate.deleteMany({
        where: { staffId: { in: people } },
      });
      await db.staff.deleteMany({ where: { id: { in: people } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
    }
    await app?.close();
  });
  it('requires payroll access and validates mutually exclusive date filters', async () => {
    await http()
      .get(base + '/reports/paid?month=' + month)
      .expect(401);
    await http()
      .get(base + '/reports/paid?month=' + month)
      .auth(plain, { type: 'bearer' })
      .expect(403);
    for (const query of [
      '',
      '?month=2050-13',
      '?month=' + month + '&from=' + last,
      '?from=' + next + '&to=' + last,
    ])
      await get(base + '/reports/paid' + query).expect(400);
  });
  it('reconciles the register and all-staff totals across calendar boundaries, retries and voids', async () => {
    await post(period + '/generate').expect(201);
    createdPeriod = (
      await db.payrollPeriod.findUniqueOrThrow({ where: { month } })
    ).id;
    await post(period + '/finalize').expect(409);
    const advance = {staffId: people[1], issuedOn: toIsoDate(dates.startDate), amountPaisa: 1000, note:"Travel advance", requestId:randomUUID()};
    const issued = (await post(base + '/advances',advance).expect(201)).body.data;
    expect((await post(base + '/advances',advance).expect(201)).body.data.id).toBe(issued.id);
    for (const id of people)
      await put(base + '/staff/' + id + '/rate', {
        effectiveMonth: month,
        basicPaisa: 100000,
      }).expect(200);
    await post(period + '/generate').expect(201);
    await post(period + '/generate').expect(201);
    const entries = (await get(period)).body.data.entries as {
      id: string;
      staffId: string;
      partialMonth: boolean;
      revision: number;
    }[];
    expect(entries).toHaveLength(2);
    const full = entries.find((e) => !e.partialMonth)!;
    const partial = entries.find((e) => e.partialMonth)!;
    await post(period + '/finalize').expect(409);
    const adjustment = {
      revision: partial.revision,
      reviewNote: 'Reviewed departure day',
      adjustments: [
        {
          kind: 'DEDUCTION',
          label: 'Partial month',
          reason: 'Left during month',
          amountPaisa: 9000,
        },
      ],
    };
    await put(period + '/entries/' + partial.id, adjustment).expect(200);
    await put(period + '/entries/' + partial.id, adjustment).expect(409);
    await post(period + '/finalize').expect(201);
    expect((await db.salaryAdvance.findUniqueOrThrow({where:{id:issued.id}})).settledEntryId).toBe(partial.id);
    await post(period + '/reopen', { reason: 'Review' }).expect(201);
    expect((await db.salaryAdvance.findUniqueOrThrow({where:{id:issued.id}})).settledEntryId).toBeNull();
    await post(period + '/finalize').expect(201);
    await put(base + '/staff/' + people[0] + '/rate', {
      effectiveMonth: '2050-03',
      basicPaisa: 200000,
    }).expect(200);
    const pay = (
      id: string,
      amountPaisa: number,
      paidOn: string,
      requestId = randomUUID(),
    ) =>
      post(period + '/entries/' + id + '/payments', {
        amountPaisa,
        paidOn,
        requestId,
        method: 'BANK',
      });
    const key = randomUUID();
    const first = await pay(full.id, 40001, last, key).expect(201);
    expect((await pay(full.id, 40001, last, key)).body.data.id).toBe(
      first.body.data.id,
    );
    await pay(full.id, 59999, next).expect(201);
    await pay(full.id, 1, next).expect(409);
    await pay(partial.id, 29999, last).expect(201);
    const mistaken = await pay(partial.id, 100, next).expect(201);
    await post(period + '/payments/' + mistaken.body.data.id + '/void', {
      reason: 'Duplicate office entry',
    }).expect(201);
    await post(period + '/reopen', { reason: 'Too late' }).expect(409);
    await put(period + '/entries/' + partial.id, adjustment).expect(409);
    const report = async (query: string) =>
      (await get(base + '/reports/paid?' + query).expect(200)).body.data;
    expect(await report('month=' + month)).toMatchObject({
      totalPaid: 70000,
      staffCount: 2,
      paymentCount: 2,
    });
    expect(await report('month=2050-03')).toMatchObject({
      totalPaid: 59999,
      staffCount: 1,
      paymentCount: 1,
    });
    expect(await report('from=' + last + '&to=' + next)).toMatchObject({
      totalPaid: 129999,
      staffCount: 2,
      paymentCount: 3,
    });
    expect(await report('from=' + next + '&to=' + next)).toMatchObject({
      totalPaid: 59999,
    });
    expect(await report('month=2050-01')).toMatchObject({
      totalPaid: 0,
      rows: [],
    });
    const history = (await get(base + '/staff/' + partial.staffId + '/history'))
      .body.data;
    expect(history[0]).toMatchObject({
      month,
      net: 90000,
      paid: 29999,
      outstanding: 60001,
    });
    expect(
      (await get(period)).body.data.entries.find(
        (e: { id: string }) => e.id === full.id,
      ),
    ).toMatchObject({ basicPaisa: 100000, outstanding: 0 });
    const transfer = {requestId:randomUUID(), paidOn:last, method:'WALLET', reference:'wallet receipt',
      allocations:[{entryId:partial.id,amountPaisa:60001}]};
    const endpoint=base+'/staff/'+partial.staffId+'/transfers';
    await post(endpoint,transfer).expect(201);
    await post(endpoint,transfer).expect(201);
    expect(await db.payrollPayment.count({where:{transferId:transfer.requestId}})).toBe(1);
    expect((await report('month='+month)).advancesIssued).toBe(1000);

    const secondMonth = '2050-03';
    const secondPath = base + '/periods/' + secondMonth;
    expect(await db.payrollPeriod.count({where:{month:secondMonth}})).toBe(0);
    const missed = await db.staff.create({data:{
      staffNo:tag+'-late',firstName:'Late',lastName:'Registration',gender:'OTHER',
      kind:'NON_TEACHING',joinDate:dates.startDate,status:'ACTIVE',
    }});
    people.push(missed.id);
    await put(base+'/staff/'+missed.id+'/rate',{effectiveMonth:month,basicPaisa:50000}).expect(200);
    const added=(await post(period+'/supplements/'+missed.id,{reason:'Backdated employment'}).expect(201)).body.data;
    await post(period+'/entries/'+added.id+'/lock').expect(201);
    await post(secondPath+'/generate').expect(201);
    secondPeriod=(await db.payrollPeriod.findUniqueOrThrow({where:{month:secondMonth}})).id;
    await post(secondPath+'/finalize').expect(201);
    const newer=await db.payrollEntry.findFirstOrThrow({where:{periodId:secondPeriod,staffId:missed.id}});
    const combined={...transfer,requestId:randomUUID(),allocations:[
      {entryId:added.id,amountPaisa:50000},{entryId:newer.id,amountPaisa:50001}
    ]};
    const combinedPath=base+'/staff/'+missed.id+'/transfers';
    await post(combinedPath,combined).expect(409);
    expect(await db.payrollPayment.count({where:{transferId:combined.requestId}})).toBe(0);
    combined.allocations[1].amountPaisa=40000;
    await post(combinedPath,combined).expect(201);
    await post(combinedPath,combined).expect(201);
    expect(await db.payrollPayment.count({where:{transferId:combined.requestId}})).toBe(2);
    const paidReport=await report('month='+month);
    expect(paidReport.rows.find((r:{staffId:string})=>r.staffId===missed.id)).toMatchObject({paid:90000,payments:1});
  });
});
