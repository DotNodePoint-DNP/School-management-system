import { Injectable } from '@nestjs/common';
import { toIsoDate } from '../../common/utils/bs-date.js';
import { toPaisa } from '../../common/utils/money.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface HeldCredit {
  totalPaisa: number;
  /** Oldest receipt first: the order credit is used in. */
  payments: {
    id: string;
    receiptNo: string;
    paidOn: string;
    unappliedPaisa: number;
  }[];
}

@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  /** What each student holds as unapplied advance credit. Students with none are left out of the result. */
  async held(
    studentIds: string[],
    db: Pick<Prisma.TransactionClient, 'payment'> = this.prisma,
  ): Promise<Map<string, HeldCredit>> {
    const out = new Map<string, HeldCredit>();
    if (studentIds.length === 0) return out;
    const rows = await db.payment.findMany({
      where: { creditStudentId: { in: studentIds }, reversal: { is: null } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        receiptNo: true,
        paidOn: true,
        amount: true,
        creditStudentId: true,
        allocations: { select: { amount: true } },
        refunds: { select: { amount: true } },
      },
    });
    for (const r of rows) {
      const used = [...r.allocations, ...r.refunds].reduce(
        (n, x) => n + toPaisa(x.amount.toNumber()),
        0,
      );
      const unapplied = toPaisa(r.amount.toNumber()) - used;
      if (unapplied <= 0 || !r.creditStudentId) continue;
      const entry = out.get(r.creditStudentId) ?? {
        totalPaisa: 0,
        payments: [],
      };
      entry.totalPaisa += unapplied;
      entry.payments.push({
        id: r.id,
        receiptNo: r.receiptNo,
        paidOn: toIsoDate(r.paidOn),
        unappliedPaisa: unapplied,
      });
      out.set(r.creditStudentId, entry);
    }
    return out;
  }
}
