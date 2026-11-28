import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  adToBsString,
  parseIsoDate,
  todayIso,
} from '../../common/utils/bs-date.js';
import { monthBounds, reportBounds, totals } from './payroll-calculations.js';
import { lockAdvances, refreshAdvances, settleAdvances } from './advance-recovery.js';
import { randomUUID } from 'node:crypto';
import type {
  RecordPaymentDto,
  ReportFilterDto,
  ReviewEntryDto,
  SalaryRateDto,
  AdvanceDto, PreferenceDto, TransferDto,
} from './payroll.dto.js';

type Tx = Prisma.TransactionClient;
const txOptions = { maxWait: 15000, timeout: 60000 };
const detail = {
  adjustments: { orderBy: { id: 'asc' } },
  payments: { orderBy: [{ paidOn: 'desc' }, { recordedAt: 'desc' }] },
} satisfies Prisma.PayrollEntryInclude;
type Entry = Prisma.PayrollEntryGetPayload<{ include: typeof detail }>;
const withTotals = (row: Entry) => ({
  ...row, ...totals(row),
  adjustments: row.adjustments.map(a=>({...a,source:a.advanceId?'ADVANCE_RECOVERY':'MANUAL'})),
});

@Injectable()
export class PayrollService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}
  today() {
    const date = todayIso();
    return { date, month: adToBsString(date)?.slice(0, 7) };
  }

  staff() {
    return this.db.staff.findMany({
      orderBy: { staffNo: 'asc' },
      select: {
        id: true,
        staffNo: true,
        firstName: true,
        middleName: true,
        lastName: true,
        designation: true,
        status: true,
        joinDate: true,
        leftOn: true,
        payrollPreference: true,
        salaryRates: {
          orderBy: { effectiveMonth: 'desc' },
          select: { effectiveMonth: true, basicPaisa: true },
        },
      },
    });
  }
  async rate(staffId: string, dto: SalaryRateDto, actor: AuthUser) {
    monthBounds(dto.effectiveMonth);
    return this.db.$transaction(async (tx) => {
      await tx.staff.findUniqueOrThrow({
        where: { id: staffId },
        select: { id: true },
      });
      const row = await tx.staffSalaryRate.upsert({
        where: {
          staffId_effectiveMonth: {
            staffId,
            effectiveMonth: dto.effectiveMonth,
          },
        },
        create: {
          staffId, effectiveMonth: dto.effectiveMonth, basicPaisa: dto.basicPaisa, recordedBy: actor.id,
        },
        update: { basicPaisa: dto.basicPaisa, recordedBy: actor.id },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'payroll.rate_saved',
        entityType: 'salary_rate',
        entityId: row.id,
        details: { effectiveMonth: dto.effectiveMonth },
      });
      return row;
    }, txOptions);
  }
  async register(month: string) {
    const dates = monthBounds(month);
    const period = await this.db.payrollPeriod.findUnique({
      where: { month },
      include: { entries: { include: detail, orderBy: { staffNo: 'asc' } } },
    });
    return {
      month,
      ...dates,
      exists: !!period,
      finalizedAt: period?.finalizedAt ?? null,
      entries: period?.entries.map(withTotals) ?? [],
    };
  }
  async history(staffId: string) {
    const rows = await this.db.payrollEntry.findMany({
      where: { staffId },
      include: {
        ...detail,
        period: { select: { month: true, finalizedAt: true } },
      },
      orderBy: { period: { month: 'desc' } },
    });
    return rows.map((row) => ({
      ...withTotals(row),
      month: row.period.month,
      finalizedAt: row.supplementalDraft ? null : row.period.finalizedAt,
    }));
  }

  // A period lock serializes roster generation, review, finalization and payment changes.
  private async lock(tx: Tx, month: string) {
    monthBounds(month);
    await tx.$queryRaw`SELECT id FROM payroll_periods WHERE month=${month} FOR UPDATE`;
    return tx.payrollPeriod.findUniqueOrThrow({ where: { month } });
  }
  private requireDraft(period: { finalizedAt: Date | null }) {
    if (period.finalizedAt)
      throw new ConflictException('This payroll month is finalized.');
  }
  private async syncRoster(
    tx: Tx,
    period: { id: string; month: string; startDate: Date; endDate: Date },
    onlyStaffId: string | null = null,
  ) {
    const { id, month, startDate, endDate } = period;
    const changed = await tx.$executeRaw`
      INSERT INTO payroll_entries (id,period_id,staff_id,staff_no,name,designation,basic_paisa,partial_month)
      SELECT gen_random_uuid(), ${id}::uuid,s.id,s.staff_no,concat_ws(' ',s.first_name,s.middle_name,s.last_name),
        s.designation,rate.basic_paisa,(s.join_date>${startDate}::date OR coalesce(s.left_on<${endDate}::date,false))
      FROM staff s LEFT JOIN LATERAL (
        SELECT basic_paisa FROM staff_salary_rates WHERE staff_id=s.id AND effective_month<=${month}
        ORDER BY effective_month DESC LIMIT 1
      ) rate ON true
      WHERE s.join_date<=${endDate}::date AND (s.left_on>=${startDate}::date OR (s.left_on IS NULL AND s.status='ACTIVE'))
        AND (${onlyStaffId}::uuid IS NULL OR s.id=${onlyStaffId}::uuid)
      ON CONFLICT (period_id,staff_id) DO UPDATE SET
        basic_paisa=excluded.basic_paisa,partial_month=excluded.partial_month,staff_no=excluded.staff_no,
        name=excluded.name,designation=excluded.designation,revision=payroll_entries.revision+1,review_note=NULL
      WHERE (payroll_entries.basic_paisa,payroll_entries.partial_month,payroll_entries.staff_no,payroll_entries.name,payroll_entries.designation)
        IS DISTINCT FROM (excluded.basic_paisa,excluded.partial_month,excluded.staff_no,excluded.name,excluded.designation)`;
    const removed = await tx.payrollEntry.deleteMany({
      where: {
        periodId: id,
        staffId: onlyStaffId ?? undefined,
        staff: {
          OR: [
            { joinDate: { gt: endDate } },
            { leftOn: { lt: startDate } },
            { status: 'LEFT', leftOn: null },
          ],
        },
      },
    });
    const initialized=await tx.payrollEntry.updateMany({
      where:{periodId:id,staffId:onlyStaffId??undefined,totalDays:null},
      data:{totalDays:Math.round((+endDate-+startDate)/86400000)+1},
    });
    return changed + removed.count + initialized.count;
  }
  generate(month: string, actor: AuthUser) {
    const dates = monthBounds(month);
    return this.db.$transaction(async (tx) => {
      // Native conflict handling also covers two first-time generations.
      await tx.payrollPeriod.createMany({
        data: [{ month, ...dates }],
        skipDuplicates: true,
      });
      const period = await this.lock(tx, month);
      this.requireDraft(period);
      const changed = await this.syncRoster(tx, period);
      const advancesChanged=await refreshAdvances(tx,period.id);
      await this.audit.recordIn(tx, {
        actor,
        action: 'payroll.generated',
        entityType: 'payroll_period',
        entityId: period.id,
        details: { month, changed },
      });
      return { changed: changed+advancesChanged };
    }, txOptions);
  }
  review(month: string, id: string, dto: ReviewEntryDto, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const period = await this.lock(tx, month);
      const entry = await tx.payrollEntry.findUniqueOrThrow({
        where: { id, periodId: period.id },
        include:detail,
      });
      if (!entry.supplementalDraft) this.requireDraft(period);
      if (entry.supplementalDraft && !actor.permissions.includes('payroll:unlock'))
        throw new ForbiddenException('Payroll unlock permission is required to review a historical addition.');
      if (entry.revision !== dto.revision)
        throw new ConflictException(
          'This row changed. Reload it before saving.',
        );
      const totalDays=dto.totalDays??entry.totalDays;
      const presentDays=dto.presentDays===undefined?entry.presentDays:dto.presentDays;
      const leaveMode=dto.leaveMode??entry.leaveMode;
      if (presentDays!=null && (!totalDays || presentDays>totalDays))
        throw new BadRequestException('Present days cannot exceed total days.');
      if (leaveMode==='AUTO' && (presentDays==null || !totalDays || entry.basicPaisa==null))
        throw new BadRequestException('Confirm the salary, total days and present days first.');
      const leaveOverridePaisa=leaveMode==='OVERRIDE'?(dto.leaveOverridePaisa??entry.leaveOverridePaisa):null;
      if (leaveMode==='OVERRIDE' && (leaveOverridePaisa==null || !dto.reviewNote?.trim()))
        throw new BadRequestException('An override requires an amount and a review note.');
      const advances=entry.adjustments.filter(a=>a.advanceId!==null);
      const deferred=new Set(dto.deferredAdvanceIds??advances.filter(a=>a.deferred).map(a=>a.advanceId!));
      if ([...deferred].some(id=>!advances.some(a=>a.advanceId===id))) throw new ConflictException('The advance list changed. Refresh the row.');
      const amounts = totals({...entry,totalDays,presentDays,leaveMode,leaveOverridePaisa,
        adjustments:[...dto.adjustments,...advances.map(a=>({...a,deferred:deferred.has(a.advanceId!)}))]});
      if (amounts.net < 0)
        throw new BadRequestException('Deductions exceed earnings.');
      await tx.payrollEntry.update({
        where: { id },
        data: {
          revision: { increment: 1 },
          reviewNote: dto.reviewNote || null,
          totalDays,presentDays,leaveMode,leaveOverridePaisa,
          adjustments: { deleteMany: {advanceId:null}, create: dto.adjustments },
        },
      });
      if (dto.deferredAdvanceIds) {
        await tx.payrollAdjustment.updateMany({where:{entryId:id,advanceId:{not:null}},data:{deferred:false}});
        if (deferred.size) await tx.payrollAdjustment.updateMany({where:{entryId:id,advanceId:{in:[...deferred]}},data:{deferred:true}});
      }
      await this.audit.recordIn(tx, {
        actor,
        action: 'payroll.entry_reviewed',
        entityType: 'payroll_entry',
        entityId: id,
        details: { month, revision: entry.revision + 1 },
      });
      return { saved: true };
    }, txOptions);
  }
  finalize(month: string, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const period = await this.lock(tx, month);
      this.requireDraft(period);
      if (await this.syncRoster(tx, period) || await refreshAdvances(tx,period.id))
        throw new ConflictException(
          'Staff or salaries changed. Refresh the draft roster and review it first.',
        );
      const rows = await tx.payrollEntry.findMany({
        where: { periodId: period.id },
        include: detail,
      });
      if (!rows.length)
        throw new ConflictException(
          'There are no staff entries for this month.',
        );
      if (
        rows.some(
          (r) =>
            r.basicPaisa === null ||
            (r.partialMonth && !r.reviewNote) ||
            totals(r).net < 0,
        )
      )
        throw new ConflictException(
          'Set missing salaries, review partial months and resolve negative amounts before finalizing.',
        );
      await tx.payrollPeriod.update({
        where: { id: period.id },
        data: { finalizedAt: new Date(), finalizedBy: actor.id },
      });
      await settleAdvances(tx,rows);
      await this.audit.recordIn(tx, {
        actor,
        action: 'payroll.finalized',
        entityType: 'payroll_period',
        entityId: period.id,
        details: { month },
      });
      return { finalized: true };
    }, txOptions);
  }
  reopen(month: string, reason: string, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const period = await this.lock(tx, month);
      if (
        !period.finalizedAt ||
        (await tx.payrollPayment.count({
          where: { entry: { periodId: period.id } },
        }))
      )
        throw new ConflictException(
          'Only a finalized month with no payment history can be reopened.',
        );
      await tx.payrollPeriod.update({
        where: { id: period.id },
        data: { finalizedAt: null, finalizedBy: null },
      });
      await lockAdvances(tx);
      await tx.salaryAdvance.updateMany({where:{settledEntry:{periodId:period.id}},data:{settledEntryId:null}});
      await tx.payrollEntry.updateMany({where:{periodId:period.id,supplementalDraft:true},data:{supplementalDraft:false}});
      await this.audit.recordIn(tx, {
        actor,
        action: 'payroll.reopened',
        entityType: 'payroll_period',
        entityId: period.id,
        details: { month, reason },
      });
      return { reopened: true };
    }, txOptions);
  }
  pay(month: string, entryId: string, dto: RecordPaymentDto, actor: AuthUser) {
    const paidOn = parseIsoDate(dto.paidOn, 'Payment date');
    if (dto.paidOn > todayIso())
      throw new BadRequestException(
        'A recorded payment cannot be future dated.',
      );
    return this.db.$transaction(async (tx) => {
      const period = await this.lock(tx, month);
      if (!period.finalizedAt)
        throw new ConflictException(
          'Finalize the register before recording payments.',
        );
      const entry = await tx.payrollEntry.findUniqueOrThrow({
        where: { id: entryId, periodId: period.id },
        include: detail,
      });
      const reference = dto.reference || null;
      if (entry.supplementalDraft) throw new ConflictException('Lock this added entry before recording payments.');
      const previous = entry.payments.find(
        (p) => p.requestId === dto.requestId,
      );
      if (previous) {
        if (
          previous.amountPaisa !== dto.amountPaisa ||
          previous.method !== dto.method ||
          previous.reference !== reference ||
          +previous.paidOn !== +paidOn
        )
          throw new ConflictException(
            'This payment request was already used with different details.',
          );
        return previous;
      }
      if (dto.amountPaisa > totals(entry).outstanding)
        throw new ConflictException('Payment exceeds the outstanding salary.');
      const payment = await tx.payrollPayment.create({
        data: {
          entryId,
          requestId: dto.requestId,
          amountPaisa: dto.amountPaisa,
          method: dto.method,
          paidOn,
          reference,
          recordedBy: actor.id,
        },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'payroll.payment_recorded',
        entityType: 'payroll_payment',
        entityId: payment.id,
        details: { entryId, month },
      });
      return payment;
    }, txOptions);
  }
  voidPayment(month: string, id: string, reason: string, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      const period = await this.lock(tx, month);
      const payment = await tx.payrollPayment.findFirstOrThrow({
        where: { id, entry: { periodId: period.id } },
      });
      if (payment.voidedAt)
        throw new ConflictException('This payment was already voided.');
      await tx.payrollPayment.update({
        where: { id },
        data: { voidedAt: new Date(), voidedBy: actor.id, voidReason: reason },
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'payroll.payment_voided',
        entityType: 'payroll_payment',
        entityId: id,
        details: { month, reason },
      });
      return { voided: true };
    }, txOptions);
  }
  async attendance(month:string,staffId:string) {
    const {startDate,endDate}=monthBounds(month);
    const [presentDays,leave]=await Promise.all([
      this.db.staffPunch.count({where:{staffId,kind:'IN',workDate:{gte:startDate,lte:endDate}}}),
      this.db.staffAttendanceRequest.findMany({where:{staffId,kind:'LEAVE',status:'APPROVED',fromDate:{lte:endDate},toDate:{gte:startDate}},
        select:{fromDate:true,toDate:true},orderBy:{fromDate:'asc'}}),
    ]);
    return {presentDays,leave};
  }
  preferences(staffId:string,dto:PreferenceDto,actor:AuthUser) {
    return this.db.$transaction(async tx=>{
      await tx.staff.findUniqueOrThrow({where:{id:staffId},select:{id:true}});
      const data={method:dto.method,accountRef:dto.method==='CASH'?null:dto.accountRef||null};
      const result=await tx.payrollPreference.upsert({where:{staffId},create:{staffId,...data},update:data});
      await this.audit.recordIn(tx,{actor,action:'payroll.preference_saved',entityType:'staff',entityId:staffId});
      return result;
    },txOptions);
  }
  advances() {
    return this.db.salaryAdvance.findMany({orderBy:[{issuedOn:'desc'},{id:'desc'}],include:{
      staff:{select:{staffNo:true,firstName:true,lastName:true}},settledEntry:{select:{period:{select:{month:true}}}},
    }});
  }
  issueAdvance(dto:AdvanceDto,actor:AuthUser) {
    const issuedOn=parseIsoDate(dto.issuedOn,'Advance date');
    if(dto.issuedOn>todayIso()) throw new BadRequestException('Advance date cannot be in the future.');
    return this.db.$transaction(async tx=>{
      await lockAdvances(tx);
      const existing=await tx.salaryAdvance.findUnique({where:{requestId:dto.requestId}});
      if(existing) {
        if(existing.staffId!==dto.staffId || +existing.issuedOn!==+issuedOn || existing.amountPaisa!==dto.amountPaisa || existing.note!==dto.note)
          throw new ConflictException('This advance request already has different details.');
        return existing;
      }
      const staff=await tx.staff.findUniqueOrThrow({where:{id:dto.staffId},select:{joinDate:true,leftOn:true}});
      if(issuedOn<staff.joinDate || (staff.leftOn && issuedOn>staff.leftOn)) throw new BadRequestException('Advance date is outside employment.');
      const row=await tx.salaryAdvance.create({data:{staffId:dto.staffId,issuedOn,amountPaisa:dto.amountPaisa,note:dto.note,requestId:dto.requestId,recordedBy:actor.id}});
      await this.audit.recordIn(tx,{actor,action:'payroll.advance_recorded',entityType:'salary_advance',entityId:row.id});
      return row;
    },txOptions);
  }
  async missing(staffId:string) {
    const staff=await this.db.staff.findUniqueOrThrow({where:{id:staffId},select:{joinDate:true,leftOn:true,
      salaryRates:{orderBy:{effectiveMonth:'asc'},take:1},payrollEntries:{select:{period:{select:{month:true}}}}}});
    const latest=staff.leftOn && staff.leftOn.toISOString().slice(0,10)<todayIso()?staff.leftOn.toISOString().slice(0,10):todayIso();
    const firstRate=staff.salaryRates[0]?.effectiveMonth;
    const joined=adToBsString(staff.joinDate.toISOString().slice(0,10))?.slice(0,7);
    const end=adToBsString(latest)?.slice(0,7);
    if(!firstRate||!joined||!end) return [];
    const start=firstRate>joined?firstRate:joined;
    const periods=await this.db.payrollPeriod.findMany({where:{month:{gte:start,lte:end}},select:{month:true,finalizedAt:true}});
    const present=new Set(staff.payrollEntries.map(e=>e.period.month));
    const missing:{month:string;state:string}[]=[];
    for(let m=start;m<=end;){
      const period=periods.find(p=>p.month===m);
      if(!present.has(m)) missing.push({month:m,state:period?.finalizedAt?'Locked':period?'Draft':'No register'});
      const [y,n]=m.split('-').map(Number);
      m=n===12?(y+1)+'-01':y+'-'+String(n+1).padStart(2,'0');
    }
    return missing;
  }
  supplement(month:string,staffId:string,reason:string,actor:AuthUser) {
    return this.db.$transaction(async tx=>{
      const period=await this.lock(tx,month);
      if(!period.finalizedAt) throw new ConflictException('Refresh the regular draft instead.');
      const previous=await tx.payrollEntry.findUnique({where:{periodId_staffId:{periodId:period.id,staffId}}});
      if(previous&&!previous.supplementalDraft) throw new ConflictException('A locked entry already exists.');
      await this.syncRoster(tx,period,staffId);
      const entry=await tx.payrollEntry.findUnique({where:{periodId_staffId:{periodId:period.id,staffId}}});
      if(!entry) throw new BadRequestException('This staff member was not employed during this month.');
      await tx.payrollEntry.update({where:{id:entry.id},data:{supplementalDraft:true,reviewNote:reason,revision:{increment:1}}});
      await refreshAdvances(tx,period.id,entry.id);
      await this.audit.recordIn(tx,{actor,action:'payroll.supplement_created',entityType:'payroll_entry',entityId:entry.id,details:{month,reason}});
      return {id:entry.id};
    },txOptions);
  }
  lockSupplement(month:string,id:string,actor:AuthUser) {
    return this.db.$transaction(async tx=>{
      const period=await this.lock(tx,month);
      const row=await tx.payrollEntry.findUniqueOrThrow({where:{id,periodId:period.id},include:detail});
      if(!period.finalizedAt || !row.supplementalDraft) throw new ConflictException('Select a draft historical addition.');
      if(await this.syncRoster(tx,period,row.staffId) || await refreshAdvances(tx,period.id,id))
        throw new ConflictException('Refresh the historical addition and review the updated figures.');
      if(row.basicPaisa==null || !row.reviewNote || totals(row).net<0) throw new ConflictException('Review the salary, deductions and reason first.');
      await settleAdvances(tx,[row]);
      await tx.payrollEntry.update({where:{id},data:{supplementalDraft:false}});
      await this.audit.recordIn(tx,{actor,action:'payroll.supplement_locked',entityType:'payroll_entry',entityId:id});
      return {locked:true};
    },txOptions);
  }
  transfer(staffId:string,dto:TransferDto,actor:AuthUser) {
    const paidOn=parseIsoDate(dto.paidOn,'Payment date');
    if(dto.paidOn>todayIso()) throw new BadRequestException('Payment date cannot be in the future.');
    const ids=dto.allocations.map(a=>a.entryId);
    if(new Set(ids).size!==ids.length) throw new BadRequestException('Select each salary month once.');
    return this.db.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.requestId}))`;
      const reference=dto.reference||null;
      const previous=await tx.payrollPayment.findMany({where:{transferId:dto.requestId},include:{entry:{select:{staffId:true}}}});
      if(previous.length){
        if(previous.length!==ids.length||previous.some(p=>p.entry.staffId!==staffId||+p.paidOn!==+paidOn||p.method!==dto.method||p.reference!==reference||
          !dto.allocations.some(a=>a.entryId===p.entryId&&a.amountPaisa===p.amountPaisa))) throw new ConflictException('This transfer already has different allocations.');
        return {transferId:dto.requestId};
      }
      const months=await tx.payrollPeriod.findMany({where:{entries:{some:{staffId,id:{in:ids}}}},orderBy:{month:'asc'},select:{month:true}});
      for(const p of months) {
        if(!(await this.lock(tx,p.month)).finalizedAt) throw new ConflictException('Only locked salaries can be paid.');
      }
      const entries=await tx.payrollEntry.findMany({where:{id:{in:ids},staffId},include:detail});
      const byId=new Map(entries.map(e=>[e.id,e]));
      for(const a of dto.allocations){
        const entry=byId.get(a.entryId);
        if(!entry||entry.supplementalDraft||a.amountPaisa>totals(entry).outstanding)
          throw new ConflictException('An allocation exceeds the available locked balance. Refresh the staff history.');
        const p=await tx.payrollPayment.create({data:{entryId:entry.id,requestId:randomUUID(),transferId:dto.requestId,paidOn,method:dto.method,
          reference,recordedBy:actor.id,amountPaisa:a.amountPaisa}});
        await this.audit.recordIn(tx,{actor,action:'payroll.payment_recorded',entityType:'payroll_payment',entityId:p.id,details:{transferId:dto.requestId,entryId:entry.id}});
      }
      return {transferId:dto.requestId};
    },txOptions);
  }
  async report(filter: ReportFilterDto) {
    const { startDate, endDate } = reportBounds(filter);
    const groups = await this.db.$queryRaw<
      {
        staffId: string;
        staffNo: string;
        name: string;
        amount: bigint;
        count: bigint;
      }[]
    >`
      SELECT s.id AS "staffId",s.staff_no AS "staffNo",concat_ws(' ',s.first_name,s.middle_name,s.last_name) AS name,
        SUM(p.amount_paisa) AS amount,COUNT(DISTINCT COALESCE(p.transfer_id,p.id)) AS count
      FROM payroll_payments p JOIN payroll_entries e ON e.id=p.entry_id JOIN staff s ON s.id=e.staff_id
      WHERE p.voided_at IS NULL AND p.paid_on BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY s.id ORDER BY s.staff_no`;
    const rows = groups.map((r) => ({
      staffId: r.staffId,
      staffNo: r.staffNo,
      name: r.name,
      paid: Number(r.amount),
      payments: Number(r.count),
    }));
    const advances=await this.db.salaryAdvance.aggregate({where:{issuedOn:{gte:startDate,lte:endDate}},_sum:{amountPaisa:true},_count:true});
    return {
      advancesIssued:advances._sum.amountPaisa??0,advanceCount:advances._count,
      startDate,
      endDate,
      rows,
      totalPaid: rows.reduce((sum, r) => sum + r.paid, 0),
      paymentCount: rows.reduce((sum, r) => sum + r.payments, 0),
      staffCount: rows.length,
    };
  }
}
