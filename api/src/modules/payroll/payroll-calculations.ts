import { BadRequestException } from '@nestjs/common';
import { daysInBsMonth } from 'bikram-sambat-ts';
import {
  bsToIso,
  isoToDate,
  parseIsoDate,
} from '../../common/utils/bs-date.js';
import type { ReportFilterDto } from './payroll.dto.js';

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new BadRequestException('Choose a BS month in YYYY-MM format.');
  const startDate = isoToDate(bsToIso(month + '-01', 'Payroll month'));
  const [year, m] = month.split('-').map(Number);
  const endDate = isoToDate(
    bsToIso(month + '-' + daysInBsMonth(year, m), 'Payroll month'),
  );
  return { startDate, endDate };
}
export function reportBounds(filter: ReportFilterDto) {
  if (
    filter.month !== undefined &&
    filter.from === undefined &&
    filter.to === undefined
  )
    return monthBounds(filter.month);
  if (filter.month !== undefined || !filter.from || !filter.to)
    throw new BadRequestException(
      'Choose one BS month or supply both AD date boundaries.',
    );
  const startDate = parseIsoDate(filter.from, 'From date');
  const endDate = parseIsoDate(filter.to, 'Through date');
  if (startDate > endDate)
    throw new BadRequestException(
      'The through date must be on or after the from date.',
    );
  return { startDate, endDate };
}
export interface LeaveInputs {
  presentDays?: number | null;
  totalDays?: number | null;
  leaveMode?: 'NONE'|'AUTO'|'OVERRIDE';
  leaveOverridePaisa?: number | null;
  basicPaisa: number | null;
}
export function leaveDeduction(entry: LeaveInputs) {
  if (entry.leaveMode === 'OVERRIDE') return entry.leaveOverridePaisa ?? 0;
  if (entry.leaveMode !== 'AUTO' || !entry.totalDays || entry.presentDays == null) return 0;
  return Math.round((entry.totalDays-entry.presentDays)*(entry.basicPaisa ?? 0)/entry.totalDays);
}
export function totals(entry: LeaveInputs & {
  basicPaisa: number | null;
  adjustments: { kind: string; amountPaisa: number; deferred?: boolean }[];
  payments: { voidedAt: Date | null; amountPaisa: number }[];
}) {
  let additions = 0,
    deductions = leaveDeduction(entry);
  for (const line of entry.adjustments) {
    if (line.deferred) continue;
    if (line.kind === 'ADDITION') additions += line.amountPaisa;
    else deductions += line.amountPaisa;
  }
  const net = (entry.basicPaisa ?? 0) + additions - deductions;
  const paid = entry.payments.reduce(
    (sum, p) => sum + (p.voidedAt ? 0 : p.amountPaisa),
    0,
  );
  return { additions, deductions, net, paid, outstanding: net - paid, leavePaisa: leaveDeduction(entry),
    paymentStatus: net <= paid ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID' };
}
