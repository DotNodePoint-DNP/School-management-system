import { describe, expect, it } from 'vitest';
import { totals } from './payroll-calculations.js';

describe('salary adjustments and balances', () => {
  const entry = {
    basicPaisa: 10000,
    totalDays: 30,
    presentDays: 28,
    adjustments: [
      {kind:'DEDUCTION', amountPaisa:500},
      {kind:'DEDUCTION', amountPaisa:1000, deferred:true},
      {kind:'ADDITION', amountPaisa:200},
    ],
    payments: [{amountPaisa: 400, voidedAt:null}, {amountPaisa:50, voidedAt:new Date()}],
  };
  it('rounds missing days once and excludes deferred advances and voided payments', () => {
    expect(totals({...entry,leaveMode:'AUTO'})).toMatchObject({
      leavePaisa:667, net:9033, paid:400, outstanding:8633, paymentStatus:'PARTIAL',
    });
  });
  it('uses the reviewed override and keeps legacy entries free of automatic deductions', () => {
    expect(totals({...entry,leaveMode:'OVERRIDE',leaveOverridePaisa:80}).net).toBe(9620);
    expect(totals(entry).net).toBe(9700);
  });
});
