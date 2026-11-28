import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

// Two draft months may preview the same advance. Serialize creation, refresh and
// settlement so one month can claim it and the other must refresh before locking.
export async function lockAdvances(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('staff-payroll:advance-recovery'))`;
}
export async function refreshAdvances(tx: Tx, periodId: string, entryId: string | null = null) {
  await lockAdvances(tx);
  const removed = await tx.$executeRaw`
    WITH stale AS (
      DELETE FROM payroll_adjustments d USING payroll_entries e,salary_advances a
      WHERE d.entry_id=e.id AND d.advance_id=a.id AND e.period_id=${periodId}::uuid
        AND (${entryId}::uuid IS NULL OR e.id=${entryId}::uuid)
        AND a.settled_entry_id IS NOT NULL AND a.settled_entry_id<>e.id RETURNING d.entry_id
    ) UPDATE payroll_entries SET revision=revision+1 WHERE id IN (SELECT entry_id FROM stale)`;
  const added = await tx.$executeRaw`
    WITH inserted AS (
      INSERT INTO payroll_adjustments(id,entry_id,kind,label,reason,amount_paisa,advance_id)
      SELECT gen_random_uuid(),e.id,'DEDUCTION','Salary advance',
             to_char(a.issued_on,'YYYY-MM-DD') || ' · ' || a.note,a.amount_paisa,a.id
      FROM payroll_entries e JOIN payroll_periods p ON p.id=e.period_id
      JOIN salary_advances a ON a.staff_id=e.staff_id AND a.issued_on<=p.end_date AND a.settled_entry_id IS NULL
      WHERE p.id=${periodId}::uuid AND (${entryId}::uuid IS NULL OR e.id=${entryId}::uuid)
      ON CONFLICT(entry_id,advance_id) DO NOTHING RETURNING entry_id
    ) UPDATE payroll_entries SET revision=revision+1 WHERE id IN (SELECT entry_id FROM inserted)`;
  return removed+added;
}
export async function settleAdvances(tx: Tx, entries: {id:string;adjustments:{advanceId:string|null;deferred:boolean}[]}[]) {
  for (const entry of entries) {
    const ids=entry.adjustments.flatMap(a=>a.advanceId&&!a.deferred?[a.advanceId]:[]);
    if (!ids.length) continue;
    const claimed=await tx.salaryAdvance.updateMany({where:{id:{in:ids},settledEntryId:null},data:{settledEntryId:entry.id}});
    if (claimed.count!==ids.length) throw new ConflictException('An advance was recovered elsewhere. Refresh the draft and review the deductions.');
  }
}
