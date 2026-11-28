"use client";
import { useState } from "react";
import { downloadCsv } from "./csv";
import { button } from "./shared";
import { useQuery } from "@tanstack/react-query";
import { payroll, type Filter } from "./service";
import {
  card,
  field,
  Label,
  MonthPicker,
  Metrics,
  ErrorText,
  money,
  usePayrollKey,
  dateOnly,
} from "./shared";

export default function PaidReport({
  initialMonth,
  today,
}: {
  initialMonth: string;
  today: string;
}) {
  const [mode, setMode] = useState("month");
  const [month, setMonth] = useState(initialMonth);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const filter: Filter = mode === "month" ? { month } : { from, to };
  const valid = mode === "month" || Boolean(from && to && from <= to);
  const result = useQuery({
    queryKey: [...usePayrollKey(), "paid-report", filter],
    queryFn: () => payroll.report(filter),
    enabled: valid,
  });
  const report = result.data;
  return (
    <section className={card}>
      <h2 className="text-xl font-semibold">Total paid to all staff</h2>
      <p className="text-sm text-ink/80">
        Based on the payment date. Voided payments are excluded.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <Label text="Filter by">
          <select
            className={field}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="month">Payment month (BS)</option>
            <option value="range">Date range (AD)</option>
          </select>
        </Label>
        {mode === "month" ? (
          <MonthPicker value={month} onChange={setMonth} />
        ) : (
          <>
            <Label text="From (AD)">
              <input
                className={field}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Label>
            <Label text="Through (AD)">
              <input
                className={field}
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </Label>
          </>
        )}
      </div>
      {!valid && (
        <p role="alert">Select a start and end date in chronological order.</p>
      )}
      <ErrorText error={result.error} />
      {result.isLoading && <p>Loading payments…</p>}
      {valid && report && (
        <>
          <p className="text-sm text-ink/75">
            {dateOnly(report.startDate)} through {dateOnly(report.endDate)} (AD)
          </p>
          <button className={button} onClick={()=>downloadCsv("Salary-payments-"+dateOnly(report.startDate)+"-"+dateOnly(report.endDate),[
            ["From (AD)","Through (AD)","Salary paid (NPR)","Advances issued (NPR)"],
            [dateOnly(report.startDate),dateOnly(report.endDate),report.totalPaid/100,report.advancesIssued/100],
            ["Staff code","Name","Payment count","Salary paid (NPR)"],...report.rows.map(r=>[r.staffNo,r.name,r.payments,r.paid/100])
          ])}>Export report CSV</button>
          <Metrics
            items={[
              ["Salary payments", money(report.totalPaid)],
              ["Advances issued", money(report.advancesIssued)],
              ["Total paid including advances", money(report.totalPaid+report.advancesIssued)],
              ["Staff paid", String(report.staffCount)],
              ["Payments", String(report.paymentCount)],
            ]}
          />
          {report.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Payments</th>
                    <th className="text-right">Total paid</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr className="border-t border-line" key={r.staffId}>
                      <td className="py-3">
                        {r.name} · {r.staffNo}
                      </td>
                      <td>{r.payments}</td>
                      <td className="text-right">{money(r.paid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No salary payments in this period.</p>
          )}
        </>
      )}
    </section>
  );
}
