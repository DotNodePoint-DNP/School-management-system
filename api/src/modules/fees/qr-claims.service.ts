import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  isoToDate,
  requireDate,
  todayIso,
} from '../../common/utils/bs-date.js';
import { fromPaisa } from '../../common/utils/money.js';
import { toPaginated } from '../../common/dto/pagination.dto.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PortalAccessService } from '../portal/portal-access.service.js';
import { InvoiceBalanceService } from './invoice-balance.service.js';
import {
  PaymentsService,
  normaliseReference,
  lockElectronicReference,
} from './payments.service.js';
import type {
  MatchStatementDto,
  QrDecisionDto,
  QrEvidenceDto,
  QrListDto,
  SubmitQrDto,
} from './dto/qr-claim.dto.js';

type Tx = Prisma.TransactionClient;
const person = { firstName: true, middleName: true, lastName: true };
const claimView = {
  trackingNumber: true,
  id: true,
  status: true,
  createdAt: true,
  amount: true,
  transferredOn: true,
  guardian: { select: { id: true, ...person } },
  student: { select: { id: true, admissionNo: true, ...person } },
  qr: { select: { id: true, merchant: true } },
  allocations: {
    select: { amount: true, invoice: { select: { id: true, number: true } } },
  },
  payment: {
    select: {
      id: true,
      receiptNo: true,
      paidOn: true,
      payerName: true,
      allocations: {
        select: {
          amount: true,
          invoice: {
            select: {
              number: true,
              studentId: true,
              student: { select: { admissionNo: true } },
            },
          },
        },
      },
      reversal: { select: { reversedAt: true } },
    },
  },
  events: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      status: true,
      createdAt: true,
      reference: true,
      note: true,
      hasImage: true,
    },
  },
} satisfies Prisma.QrClaimSelect;
async function cleanImage(file?: Express.Multer.File) {
  if (!file) return undefined;
  try {
    const image = sharp(file.buffer, { limitInputPixels: 16000000 });
    const meta = await image.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) > 1
    )
      throw new Error();
    return new Uint8Array(
      await image
        .rotate()
        .resize({
          width: 2000,
          height: 2000,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer(),
    );
  } catch {
    throw new BadRequestException(
      'Upload a PNG, JPEG or WebP image under 5 MB and 16 megapixels',
    );
  }
}
@Injectable()
export class QrClaimsService {
  constructor(
    private db: PrismaService,
    private payments: PaymentsService,
    private balances: InvoiceBalanceService,
    private access: PortalAccessService,
    private audit: AuditService,
  ) {}

  active() {
    return this.db.schoolQr.findFirst({
      where: { active: true },
      select: { id: true, merchant: true },
    });
  }

  async configure(
    actor: AuthUser,
    merchant?: string,
    file?: Express.Multer.File,
  ) {
    const image = await cleanImage(file);
    if (merchant && !image) throw new BadRequestException('Choose a QR image');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school_qr_config'))`;
      await tx.schoolQr.updateMany({
        where: { active: true },
        data: { active: false },
      });
      const qr =
        merchant && image
          ? await tx.schoolQr.create({
              data: { merchant, image, createdBy: actor.id },
              select: { id: true, merchant: true },
            })
          : null;
      await this.audit.recordIn(tx, {
        actor,
        action: 'qr.changed',
        entityType: 'schoolQr',
        entityId: qr?.id,
        details: { active: !!qr },
      });
      return qr;
    });
  }

  async child(actor: AuthUser, studentId: string) {
    return this.access.requireChildLink(actor, studentId);
  }

  async options(actor: AuthUser, studentId: string) {
    await this.child(actor, studentId);
    const [qr, dues] = await Promise.all([
      this.active(),
      this.payments.dues([studentId]),
    ]);
    return { qr, dues: dues.students[0] };
  }

  async qrImage(id: string, activeOnly: boolean) {
    const qr = await this.db.schoolQr.findFirst({
      where: { id, ...(activeOnly ? { active: true } : {}) },
      select: { image: true },
    });
    if (!qr) throw new NotFoundException('QR unavailable');
    return qr.image;
  }

  async submit(
    actor: AuthUser,
    studentId: string,
    dto: SubmitQrDto,
    file?: Express.Multer.File,
  ) {
    const scope = await this.child(actor, studentId);
    const image = await cleanImage(file);
    if (!image && !dto.reference)
      throw new BadRequestException(
        'Provide a transaction reference or screenshot',
      );
    const day = requireDate('transferredOn', dto.transferredOn);
    if (day > todayIso())
      throw new BadRequestException('Transfer date is in the future');
    const allocations = dto.allocations
      .slice()
      .sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));
    const amount = dto.amount;
    const ids = allocations.map((a) => a.invoiceId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicate invoice');
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          scope,
          actor.id,
          dto.qrId,
          day,
          amount,
          dto.reference,
          allocations,
        ]),
      )
      .update(image ?? '')
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'qr_submit:' + dto.requestKey}))`;
      const existing = await tx.qrClaim.findUnique({
        where: { requestKey: dto.requestKey },
        select: { id: true, fingerprint: true },
      });
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ConflictException('This submission key was already used');
        return { id: existing.id };
      }
      if (!(await tx.schoolQr.count({ where: { id: dto.qrId } })))
        throw new BadRequestException('Unknown school QR');
      if (
        (await tx.invoice.count({ where: { studentId, id: { in: ids } } })) !==
        ids.length
      )
        throw new BadRequestException(
          'Choose invoices belonging to this child',
        );
      if (dto.reference) await lockElectronicReference(tx, dto.reference);
      const claim = await tx.qrClaim.create({
        data: {
          ...scope,
          submittedBy: actor.id,
          requestKey: dto.requestKey,
          fingerprint,
          qrId: dto.qrId,
          transferredOn: isoToDate(day),
          amount,
          allocations: {
            create: allocations.map((a) => ({
              invoiceId: a.invoiceId,
              amount: a.amount,
            })),
          },
          events: {
            create: {
              actorId: actor.id,
              status: 'PENDING',
              reference: dto.reference
                ? normaliseReference(dto.reference)
                : undefined,
              image,
              hasImage: !!image,
            },
          },
        },
        select: { id: true },
      });
      await this.log(tx, actor, claim.id, 'PENDING');
      return claim;
    });
  }

  async list(q: QrListDto, scope?: { guardianId: string; studentId: string }) {
    const where = {
      ...scope,
      status: q.status,
      transferredOn: q.transferredOn
        ? isoToDate(requireDate('transferredOn', q.transferredOn))
        : undefined,
    };
    const [rows, count] = await this.db.$transaction([
      this.db.qrClaim.findMany({
        where,
        select: claimView,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.qrClaim.count({ where }),
    ]);
    const balances = await this.balances.load([
      ...new Set(rows.flatMap((r) => r.allocations.map((a) => a.invoice.id))),
    ]);
    return toPaginated(
      rows.map((r) => ({
        ...r,
        payment: r.payment
          ? {
              ...r.payment,
              allocations: r.payment.allocations.filter(
                (a) => !scope || a.invoice.studentId === scope.studentId,
              ),
            }
          : null,
        allocations: r.allocations.map((a) => ({
          ...a,
          outstanding: fromPaisa(
            balances.get(a.invoice.id)?.outstandingPaisa ?? 0,
          ),
        })),
      })),
      count,
      q,
    );
  }

  async image(
    id: string,
    eventId: string,
    scope?: { guardianId: string; studentId: string },
  ) {
    const row = await this.db.qrClaimEvent.findFirst({
      where: { id: eventId, claimId: id, claim: scope },
      select: { image: true },
    });
    if (!row?.image) throw new NotFoundException('Evidence unavailable');
    return row.image;
  }

  async familyDues(id: string) {
    const claim = await this.db.qrClaim.findUniqueOrThrow({
      where: { id },
      select: { guardianId: true },
    });
    const children = await this.db.studentGuardian.findMany({
      where: { guardianId: claim.guardianId, portalAccess: true },
      select: { studentId: true },
    });
    return this.payments.dues(children.map((c) => c.studentId));
  }

  async reconcile(dto: MatchStatementDto) {
    const lines = dto.lines.map((l) => ({
      ...l,
      reference: normaliseReference(l.reference),
    }));
    const references = lines.map((l) => l.reference);
    if (new Set(references).size !== references.length)
      throw new BadRequestException('Statement includes repeated references');
    const receipts = await this.db.payment.findMany({
      where: {
        OR: [{ method: 'FONEPAY_QR' }, { qrClaim: { isNot: null } }],
        reference: { in: references },
        reversal: { is: null },
      },
      select: { reference: true, amount: true, receiptNo: true, paidOn: true },
    });
    const byRef = new Map(receipts.map((r) => [r.reference, r]));
    return lines.map((l) => {
      const r = byRef.get(l.reference);
      return {
        ...l,
        receiptNo: r?.receiptNo,
        postedAmount: r?.amount.toNumber(),
        status: !r
          ? 'UNMATCHED'
          : r.amount.equals(l.amount)
            ? 'MATCHED'
            : 'AMOUNT MISMATCH',
      };
    });
  }

  private lock(tx: Tx, id: string) {
    return tx.$queryRaw`SELECT id FROM qr_claims WHERE id=${id}::uuid FOR UPDATE`;
  }
  private log(tx: Tx, actor: AuthUser, id: string, status: string) {
    return this.audit.recordIn(tx, {
      actor,
      action: 'qr.claim_changed',
      entityType: 'qrClaim',
      entityId: id,
      details: { status },
    });
  }

  async supplement(
    actor: AuthUser,
    studentId: string,
    id: string,
    dto: QrEvidenceDto,
    file?: Express.Multer.File,
  ) {
    const scope = await this.child(actor, studentId);
    if (!dto.reference && !file)
      throw new BadRequestException('Provide more evidence');
    const image = await cleanImage(file);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, id);
      const claim = await tx.qrClaim.findFirst({
        where: { id, ...scope },
        select: { status: true },
      });
      if (!claim) throw new NotFoundException('Claim unavailable');
      if (claim.status !== 'CLARIFICATION')
        throw new ConflictException('This claim is not awaiting clarification');
      if (dto.reference) await lockElectronicReference(tx, dto.reference);
      await tx.qrClaim.update({
        where: { id },
        data: {
          status: 'PENDING',
          events: {
            create: {
              actorId: actor.id,
              status: 'PENDING',
              reference: dto.reference
                ? normaliseReference(dto.reference)
                : undefined,
              image,
              hasImage: !!image,
            },
          },
        },
      });
      await this.log(tx, actor, id, 'PENDING');
      return { id };
    });
  }

  async decide(actor: AuthUser, id: string, dto: QrDecisionDto) {
    return this.db.$transaction(
      async (tx) => {
        await this.lock(tx, id);
        const claim = await tx.qrClaim.findUnique({
          where: { id },
          include: { allocations: true },
        });
        if (!claim) throw new NotFoundException('Claim unavailable');
        if (claim.status === 'APPROVED' && dto.status === 'APPROVED')
          return { id, paymentId: claim.paymentId };
        if (claim.status !== 'PENDING')
          throw new ConflictException(
            'Refresh this claim to see the latest decision',
          );
        let paymentId: string | undefined;
        if (dto.status === 'APPROVED') {
          if (!dto.reference)
            throw new BadRequestException(
              'Enter the settled merchant transaction reference',
            );
          const reference = normaliseReference(dto.reference);
          if (
            typeof dto.verifiedAmount !== 'number' ||
            !claim.amount.equals(dto.verifiedAmount)
          )
            throw new ConflictException(
              'Verified amount must match the submitted transfer',
            );
          const override =
            dto.allocations !== undefined || !!dto.creditStudentId;
          if (
            override &&
            (!dto.note?.trim() ||
              dto.existingPaymentId ||
              dto.existingReceiptNo)
          )
            throw new BadRequestException(
              'Explain the revised allocation and post a new receipt',
            );
          if (override) {
            const allowed = await tx.studentGuardian.findMany({
              where: { guardianId: claim.guardianId, portalAccess: true },
              select: { studentId: true },
            });
            const students = allowed.map((row) => row.studentId);
            const invoices = (dto.allocations ?? []).map(
              (row) => row.invoiceId,
            );
            if (
              (dto.creditStudentId &&
                dto.creditStudentId !== claim.studentId) ||
              !students.includes(claim.studentId) ||
              (await tx.invoice.count({
                where: { id: { in: invoices }, studentId: { in: students } },
              })) !== invoices.length
            )
              throw new BadRequestException(
                'Select distinct invoices belonging to the linked students of this guardian; credit stays with the submitted child',
              );
          }
          const allocations =
            dto.allocations ??
            claim.allocations.map((a) => ({
              invoiceId: a.invoiceId,
              amount: a.amount.toNumber(),
            }));
          if (dto.existingPaymentId && dto.existingReceiptNo)
            throw new BadRequestException('Choose one existing receipt');
          if (dto.existingPaymentId || dto.existingReceiptNo) {
            const paymentIdToLink =
              dto.existingPaymentId ??
              (
                await tx.payment.findUnique({
                  where: { receiptNo: dto.existingReceiptNo },
                  select: { id: true },
                })
              )?.id;
            if (!paymentIdToLink)
              throw new ConflictException(
                'No matching receipt found. Check the receipt number.',
              );
            await tx.$queryRaw`SELECT id FROM payments WHERE id=${paymentIdToLink}::uuid FOR UPDATE`;
            const receipt = await tx.payment.findUnique({
              where: { id: paymentIdToLink },
              include: { allocations: true, reversal: true },
            });
            if (
              !receipt ||
              receipt.reversal ||
              receipt.method === 'CASH' ||
              receipt.method === 'CHEQUE' ||
              receipt.reference !== reference ||
              receipt.payerGuardianId !== claim.guardianId ||
              !receipt.amount.equals(claim.amount) ||
              receipt.allocations.length !== allocations.length ||
              !claim.allocations.every((a) =>
                receipt.allocations.some(
                  (r) =>
                    a.invoiceId === r.invoiceId && a.amount.equals(r.amount),
                ),
              )
            )
              throw new ConflictException(
                'Receipt does not match this guardian, reference, amount and invoice allocation',
              );
            paymentId = receipt.id;
          } else {
            const posted = await this.payments.recordIn(
              tx,
              {
                idempotencyKey: 'qr:' + id,
                method: 'FONEPAY_QR',
                reference,
                amount: claim.amount.toNumber(),
                payerGuardianId: claim.guardianId,
                payerName: dto.sender,
                allocations,
                keepExcessAsCredit: dto.creditStudentId
                  ? { studentId: dto.creditStudentId }
                  : undefined,
              },
              actor,
            );
            paymentId = posted.id;
          }
        } else if (!dto.note?.trim())
          throw new BadRequestException('Give the family a reason');
        await tx.qrClaim.update({
          where: { id },
          data: {
            status: dto.status,
            paymentId,
            events: {
              create: {
                actorId: actor.id,
                status: dto.status,
                note: dto.note,
                reference: dto.reference
                  ? normaliseReference(dto.reference)
                  : undefined,
              },
            },
          },
        });
        await this.log(tx, actor, id, dto.status);
        return { id, paymentId };
      },
      { timeout: 60000, maxWait: 15000 },
    );
  }
}
