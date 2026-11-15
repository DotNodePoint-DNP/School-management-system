import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { adToBsString, todayIso } from '../../common/utils/bs-date.js';
import { chunked } from '../../common/utils/chunked.js';
import { fromPaisa, toPaisa } from '../../common/utils/money.js';
import { mapPool } from '../../common/utils/pool.js';
import { MessagingService } from '../../infra/messaging/messaging.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SchoolService } from '../school/school.service.js';
import { DuesReportService } from './dues-report.service.js';
import type { ReminderRunDto } from './dto/fee-reminder.dto.js';
import { reminderSubject, reminderText } from './reminder-text.js';

const MAX_RECIPIENTS = 300;
const PREVIEW_LIMIT = 2000;
const CONCURRENCY = 8;
const IN_LIMIT = 1000;
/** A claim that was never completed (a crash) stops blocking after this long. */
const PENDING_GRACE_MS = 15 * 60_000;

type Channel = 'SMS' | 'EMAIL';
type SkipReason = 'NO_CONTACT' | 'BELOW_MINIMUM' | 'RECENTLY_REMINDED';
type Outcome = 'SENT' | 'FAILED' | 'RECENTLY_REMINDED';

interface Settings {
  minDays: number;
  minPaisa: number;
  cooldownDays: number;
}
interface ChildLine {
  studentId: string;
  admissionNo: string;
  firstName: string;
  paisa: number;
  oldestDue: string;
}
interface Recipient {
  guardianId: string;
  channel: Channel;
  to: string;
  children: ChildLine[];
  totalPaisa: number;
  oldestDue: string;
  subject: string;
  text: string;
}
interface Skip {
  reason: SkipReason;
  admissionNo: string;
}

const maskTo = (channel: Channel, to: string): string =>
  channel === 'SMS'
    ? `***${to.slice(-4)}`
    : `${to.slice(0, 1)}***${to.slice(to.indexOf('@'))}`;
const summarise = (items: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
};

@Injectable()
export class FeeRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dues: DuesReportService,
    private readonly messaging: MessagingService,
    private readonly school: SchoolService,
  ) {}

  /** Exactly who would be messaged and what the first message would say. Sends nothing and writes nothing. */
  async preview(dto: ReminderRunDto) {
    const plan = await this.plan(dto);
    const problems: string[] = [];
    if (plan.recipients.length > MAX_RECIPIENTS) {
      problems.push(
        `That is ${plan.recipients.length} families. Send at most ${MAX_RECIPIENTS} at a time: choose a class or section.`,
      );
    }
    const first = plan.recipients[0];
    return {
      asOf: plan.today,
      asOfBs: adToBsString(plan.today),
      settings: {
        minDaysOverdue: plan.settings.minDays,
        minOutstanding: fromPaisa(plan.settings.minPaisa),
        cooldownDays: plan.settings.cooldownDays,
      },
      recipients: plan.recipients.length,
      total: fromPaisa(plan.totalPaisa),
      canSend: plan.recipients.length > 0 && problems.length === 0,
      problems,
      sample: first
        ? {
            channel: first.channel,
            subject: first.channel === 'EMAIL' ? first.subject : null,
            text: first.text,
          }
        : null,
      list: plan.recipients.slice(0, PREVIEW_LIMIT).map((r) => ({
        guardianId: r.guardianId,
        channel: r.channel,
        to: maskTo(r.channel, r.to),
        children: r.children.map((c) => ({
          admissionNo: c.admissionNo,
          firstName: c.firstName,
          amount: fromPaisa(c.paisa),
        })),
        total: fromPaisa(r.totalPaisa),
        oldestDueDate: r.oldestDue,
        oldestDueDateBs: adToBsString(r.oldestDue),
      })),
      skipped: plan.skipped.slice(0, PREVIEW_LIMIT),
      skippedSummary: summarise(plan.skipped.map((s) => s.reason)),
      truncated:
        plan.recipients.length > PREVIEW_LIMIT ||
        plan.skipped.length > PREVIEW_LIMIT,
    };
  }

  async send(dto: ReminderRunDto, actor: AuthUser) {
    const plan = await this.plan(dto);
    if (
      dto.expect &&
      (dto.expect.recipients !== plan.recipients.length ||
        toPaisa(dto.expect.total) !== plan.totalPaisa)
    ) {
      throw new ConflictException(
        `The figures changed since the preview (now ${plan.recipients.length} family(ies), NPR ${fromPaisa(plan.totalPaisa)}). Preview again before sending.`,
      );
    }
    if (plan.recipients.length > MAX_RECIPIENTS) {
      throw new BadRequestException(
        `That is ${plan.recipients.length} families. Send at most ${MAX_RECIPIENTS} at a time: choose a class or section.`,
      );
    }
    const skippedSummary = summarise(plan.skipped.map((s) => s.reason));
    if (plan.recipients.length === 0)
      return {
        runId: null,
        recipients: 0,
        sent: 0,
        failed: 0,
        total: 0,
        skippedSummary,
      };

    const run = await this.prisma.feeReminderRun.create({
      data: {
        sentById: actor.id,
        minDaysOverdue: plan.settings.minDays,
        cooldownDays: plan.settings.cooldownDays,
      },
      select: { id: true },
    });
    const outcomes = await mapPool(plan.recipients, CONCURRENCY, (r) =>
      this.deliver(run.id, r, plan.settings.cooldownDays),
    );

    const sentPaisa = plan.recipients
      .filter((_, i) => outcomes[i] === 'SENT')
      .reduce((n, r) => n + r.totalPaisa, 0);
    const sent = outcomes.filter((o) => o === 'SENT').length;
    const failed = outcomes.filter((o) => o === 'FAILED').length;
    const raced = plan.recipients.flatMap((r, i) =>
      outcomes[i] === 'RECENTLY_REMINDED'
        ? r.children.map(() => 'RECENTLY_REMINDED')
        : [],
    );
    for (const [reason, n] of Object.entries(summarise(raced)))
      skippedSummary[reason] = (skippedSummary[reason] ?? 0) + n;

    // Counts only: no names, phone numbers, emails or messages in the audit log.
    await this.audit.record({
      actor,
      action: 'fee_reminders.sent',
      entityType: 'fee_reminder_run',
      entityId: run.id,
      details: {
        runId: run.id,
        recipients: plan.recipients.length,
        sent,
        failed,
        skipped: outcomes.length - sent - failed,
        total: fromPaisa(sentPaisa),
      },
    });
    return {
      runId: run.id,
      recipients: plan.recipients.length,
      sent,
      failed,
      total: fromPaisa(sentPaisa),
      skippedSummary,
    };
  }

  async runs() {
    const runs = await this.prisma.feeReminderRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        sentById: true,
        minDaysOverdue: true,
        cooldownDays: true,
      },
    });
    const [counts, names] = await Promise.all([
      this.prisma.feeReminder.groupBy({
        by: ['runId', 'status'],
        where: { runId: { in: runs.map((r) => r.id) } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.names(runs.map((r) => r.sentById)),
    ]);
    return runs.map((r) => {
      const mine = counts.filter((c) => c.runId === r.id);
      const of = (status: string) => mine.find((c) => c.status === status);
      return {
        id: r.id,
        sentAt: r.createdAt.toISOString(),
        sentBy: names.get(r.sentById) ?? null,
        minDaysOverdue: r.minDaysOverdue,
        cooldownDays: r.cooldownDays,
        sent: of('SENT')?._count._all ?? 0,
        failed: of('FAILED')?._count._all ?? 0,
        pending: of('PENDING')?._count._all ?? 0,
        total: of('SENT')?._sum.amount?.toNumber() ?? 0,
      };
    });
  }

  async run(id: string) {
    const run = await this.prisma.feeReminderRun.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        sentById: true,
        minDaysOverdue: true,
        cooldownDays: true,
      },
    });
    if (!run) throw new NotFoundException('Reminder run not found');
    const [rows, names] = await Promise.all([
      this.prisma.feeReminder.findMany({
        where: { runId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          guardianId: true,
          channel: true,
          status: true,
          amount: true,
          studentCount: true,
          error: true,
          createdAt: true,
        },
      }),
      this.names([run.sentById]),
    ]);
    return {
      id: run.id,
      sentAt: run.createdAt.toISOString(),
      sentBy: names.get(run.sentById) ?? null,
      minDaysOverdue: run.minDaysOverdue,
      cooldownDays: run.cooldownDays,
      reminders: rows.map((r) => ({
        id: r.id,
        guardianId: r.guardianId,
        channel: r.channel,
        status: r.status,
        amount: r.amount.toNumber(),
        studentCount: r.studentCount,
        error: r.error,
        at: r.createdAt.toISOString(),
      })),
    };
  }

  // ---------------------------------------------------------------- sending

  /**
   * 1. Claim the family under a lock (refused if reminded recently), 2. send with no transaction held, 3. record the result.
   * A family claimed by someone else a moment ago is skipped, so a double click can never message anyone twice.
   */
  private async deliver(
    runId: string,
    r: Recipient,
    cooldownDays: number,
  ): Promise<Outcome> {
    const since = new Date(Date.now() - cooldownDays * 86_400_000);
    const pendingSince = new Date(Date.now() - PENDING_GRACE_MS);
    const claim = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fee_reminder:${r.guardianId}`}))`;
        const recent = await tx.feeReminder.findFirst({
          where: {
            guardianId: r.guardianId,
            OR: [
              { status: 'SENT', createdAt: { gte: since } },
              { status: 'PENDING', createdAt: { gte: pendingSince } },
            ],
          },
          select: { id: true },
        });
        if (recent) return null;
        return tx.feeReminder.create({
          data: {
            runId,
            guardianId: r.guardianId,
            channel: r.channel,
            amount: fromPaisa(r.totalPaisa),
            studentCount: r.children.length,
          },
          select: { id: true },
        });
      },
      { maxWait: 15_000, timeout: 30_000 },
    );
    if (!claim) return 'RECENTLY_REMINDED';

    const result =
      r.channel === 'SMS'
        ? await this.messaging.sendSms(r.to, r.text)
        : await this.messaging.sendEmail(r.to, r.subject, r.text);
    await this.prisma.feeReminder.update({
      where: { id: claim.id },
      data: result.ok
        ? { status: 'SENT', error: null }
        : {
            status: 'FAILED',
            error: (result.error || 'Delivery failed').slice(0, 200),
          },
    });
    return result.ok ? 'SENT' : 'FAILED';
  }

  // ---------------------------------------------------------------- planning

  private async plan(dto: ReminderRunDto) {
    const selectors = [
      dto.classId,
      dto.sectionId,
      dto.studentIds && dto.studentIds.length > 0 ? 'ids' : undefined,
      dto.all === true ? 'all' : undefined,
    ].filter((v) => v !== undefined);
    if (selectors.length !== 1)
      throw new BadRequestException(
        'Choose exactly one of classId, sectionId, studentIds or all: true',
      );
    const settings: Settings = {
      minDays: dto.minDaysOverdue ?? 1,
      minPaisa: toPaisa(dto.minOutstanding ?? 100),
      cooldownDays: dto.cooldownDays ?? 7,
    };
    const today = todayIso();

    let scope: string[] | undefined;
    if (dto.studentIds && dto.studentIds.length > 0) scope = dto.studentIds;
    else if (dto.classId || dto.sectionId) scope = await this.studentsIn(dto);

    // Overdue invoices only. An empty scope means nobody (never everybody): the dues report enforces that.
    const overdue = (
      await this.dues.openInvoices(
        scope ? { studentIds: scope } : {},
        this.prisma,
        today,
      )
    ).filter((i) => i.daysOverdue >= settings.minDays);
    const perStudent = new Map<string, { paisa: number; oldest: string }>();
    for (const inv of overdue) {
      const e = perStudent.get(inv.studentId);
      perStudent.set(inv.studentId, {
        paisa: (e?.paisa ?? 0) + inv.outstandingPaisa,
        oldest: e && e.oldest < inv.dueDate ? e.oldest : inv.dueDate,
      });
    }

    // Who to contact for each student: the first guardian with a phone (primary first), else the first with an email.
    const info = new Map<string, { admissionNo: string; firstName: string }>();
    const contactOf = new Map<
      string,
      { guardianId: string; channel: Channel; to: string } | null
    >();
    for (const part of chunked([...perStudent.keys()], IN_LIMIT)) {
      const [students, links] = await Promise.all([
        this.prisma.student.findMany({
          where: { id: { in: part } },
          select: { id: true, admissionNo: true, firstName: true },
        }),
        this.prisma.studentGuardian.findMany({
          where: { studentId: { in: part } },
          orderBy: [{ isPrimary: 'desc' }, { guardianId: 'asc' }],
          select: {
            studentId: true,
            guardian: { select: { id: true, phone: true, email: true } },
          },
        }),
      ]);
      for (const s of students)
        info.set(s.id, { admissionNo: s.admissionNo, firstName: s.firstName });
      const byStudent = new Map<string, typeof links>();
      for (const l of links)
        byStudent.set(l.studentId, [...(byStudent.get(l.studentId) ?? []), l]);
      for (const id of part) {
        const list = byStudent.get(id) ?? [];
        const sms = list.find((l) => l.guardian.phone);
        const mail = list.find((l) => l.guardian.email);
        contactOf.set(
          id,
          sms
            ? {
                guardianId: sms.guardian.id,
                channel: 'SMS',
                to: sms.guardian.phone as string,
              }
            : mail
              ? {
                  guardianId: mail.guardian.id,
                  channel: 'EMAIL',
                  to: mail.guardian.email as string,
                }
              : null,
        );
      }
    }

    const skipped: Skip[] = [];
    const families = new Map<
      string,
      {
        guardianId: string;
        channel: Channel;
        to: string;
        children: ChildLine[];
      }
    >();
    for (const [studentId, v] of perStudent) {
      const i = info.get(studentId);
      if (!i) continue;
      const contact = contactOf.get(studentId);
      if (!contact) {
        skipped.push({ reason: 'NO_CONTACT', admissionNo: i.admissionNo });
        continue;
      }
      const family = families.get(contact.guardianId) ?? {
        ...contact,
        children: [],
      };
      family.children.push({
        studentId,
        admissionNo: i.admissionNo,
        firstName: i.firstName,
        paisa: v.paisa,
        oldestDue: v.oldest,
      });
      families.set(contact.guardianId, family);
    }

    const recent =
      families.size === 0
        ? []
        : await this.prisma.feeReminder.findMany({
            where: {
              guardianId: { in: [...families.keys()] },
              OR: [
                {
                  status: 'SENT',
                  createdAt: {
                    gte: new Date(
                      Date.now() - settings.cooldownDays * 86_400_000,
                    ),
                  },
                },
                {
                  status: 'PENDING',
                  createdAt: { gte: new Date(Date.now() - PENDING_GRACE_MS) },
                },
              ],
            },
            select: { guardianId: true },
            distinct: ['guardianId'],
          });
    const recentSet = new Set(recent.map((r) => r.guardianId));

    const school = await this.school.displayName();
    const recipients: Recipient[] = [];
    const ordered = [...families.values()].sort((a, b) =>
      minAdmission(a.children).localeCompare(minAdmission(b.children)),
    );
    for (const family of ordered) {
      const children = [...family.children].sort((a, b) =>
        a.admissionNo.localeCompare(b.admissionNo),
      );
      const total = children.reduce((n, c) => n + c.paisa, 0);
      if (total < settings.minPaisa) {
        for (const c of children)
          skipped.push({ reason: 'BELOW_MINIMUM', admissionNo: c.admissionNo });
        continue;
      }
      if (recentSet.has(family.guardianId)) {
        for (const c of children)
          skipped.push({
            reason: 'RECENTLY_REMINDED',
            admissionNo: c.admissionNo,
          });
        continue;
      }
      const oldest = children.map((c) => c.oldestDue).sort()[0] as string;
      recipients.push({
        guardianId: family.guardianId,
        channel: family.channel,
        to: family.to,
        children,
        totalPaisa: total,
        oldestDue: oldest,
        subject: reminderSubject(school),
        text: reminderText(
          school,
          children.map((c) => ({ firstName: c.firstName, paisa: c.paisa })),
          adToBsString(oldest) ?? oldest,
        ),
      });
    }
    return {
      recipients,
      skipped,
      settings,
      today,
      totalPaisa: recipients.reduce((n, r) => n + r.totalPaisa, 0),
    };
  }

  /** The students enrolled in a class or section of the chosen (default: the active) academic year. */
  private async studentsIn(dto: ReminderRunDto): Promise<string[]> {
    if (
      dto.classId &&
      !(await this.prisma.schoolClass.findUnique({
        where: { id: dto.classId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Class not found');
    if (
      dto.sectionId &&
      !(await this.prisma.section.findUnique({
        where: { id: dto.sectionId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Section not found');
    const yearId =
      dto.academicYearId ??
      (
        await this.prisma.academicYear.findFirst({
          where: { status: 'ACTIVE' },
          select: { id: true },
        })
      )?.id;
    if (!yearId)
      throw new ConflictException(
        'There is no active academic year. Choose one (academicYearId).',
      );
    const rows = await this.prisma.enrollment.findMany({
      where: {
        academicYearId: yearId,
        status: 'ENROLLED',
        ...(dto.sectionId ? { sectionId: dto.sectionId } : {}),
        ...(dto.classId ? { classId: dto.classId } : {}),
      },
      select: { studentId: true },
    });
    return [...new Set(rows.map((r) => r.studentId))];
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName] as const));
  }
}

const minAdmission = (children: ChildLine[]): string =>
  children.map((c) => c.admissionNo).sort()[0] as string;
