"use client";
import { useState, type FormEvent } from "react";
import { payroll, type Adjustment, type Entry, type Method } from "./service";
import {
  Label,
  field,
  button,
  primary,
  card,
  ErrorText,
  usePayrollAction,
  money,
  dateOnly,
  Metrics,
} from "./shared";
import SalarySlip from "./SalarySlip";
import { useQuery } from "@tanstack/react-query";
import { usePayrollKey } from "./shared";

function DraftReview({ row, month }: { row: Entry; month: string }) {
  const action = usePayrollAction();
  const [lines, setLines] = useState(() =>
    row.adjustments.filter(a => !a.advanceId).map((a) => ({ ...a, rupees: String(a.amountPaisa / 100) })),
  );
  const [note, setNote] = useState(row.reviewNote ?? "");
  const [days, setDays] = useState(String(row.totalDays ?? ""));
  const [present, setPresent] = useState(String(row.presentDays ?? ""));
  const [mode, setMode] = useState(row.leaveMode);
  const [override, setOverride] = useState(String((row.leaveOverridePaisa ?? 0) / 100));
  const advances = row.adjustments.filter(a => a.advanceId);
  const [deferred, setDeferred] = useState(advances.filter(a => a.deferred).map(a => a.advanceId!));
  const attendance = useQuery({queryKey:[...usePayrollKey(),"attendance",month,row.staffId],queryFn:()=>payroll.attendance(month,row.staffId)});
  function submit(e: FormEvent) {
    e.preventDefault();
    const items = lines.map(({ kind, label, reason, rupees }) => ({
      kind,
      label,
      reason,
      amountPaisa: Math.round(Number(rupees) * 100),
    }));
    action.mutate(() => payroll.review(month, row, note, items, {
      totalDays: days ? Number(days) : undefined, presentDays: present === "" ? null : Number(present),
      leaveMode:mode, leaveOverridePaisa:mode === "OVERRIDE" ? Math.round(Number(override)*100) : undefined,
      deferredAdvanceIds:deferred,
    }));
  }
  function change(index: number, patch: Partial<(typeof lines)[number]>) {
    setLines(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="font-semibold">Attendance and leave</h3>
      <div className="flex flex-wrap items-end gap-3">
        <Label text="Total days"><input className={field} type="number" min="1" max="32" required value={days} onChange={e=>setDays(e.target.value)} /></Label>
        <Label text="Present days"><input className={field} type="number" min="0" max={days} required={mode==="AUTO"} value={present} onChange={e=>setPresent(e.target.value)} /></Label>
        {attendance.data && <button className={button} type="button" onClick={()=>setPresent(String(attendance.data.presentDays))}>Use {attendance.data.presentDays} recorded check-in days</button>}
        <Label text="Unpaid leave deduction"><select className={field} value={mode} onChange={e=>setMode(e.target.value as Entry["leaveMode"])}>
          <option value="NONE">No leave deduction</option><option value="AUTO">Calculate from reviewed days</option><option value="OVERRIDE">Enter amount</option>
        </select></Label>
        {mode==="OVERRIDE" && <Label text="Leave deduction (NPR)"><input className={field} type="number" min="0" step=".01" required value={override} onChange={e=>setOverride(e.target.value)} /></Label>}
      </div>
      <ErrorText error={attendance.error}/>
      {attendance.data?.leave.map((range,i)=><p key={i}>Approved leave · {dateOnly(range.fromDate)} through {dateOnly(range.toDate)}</p>)}
      {mode==="AUTO" && <p>Include paid leave and paid holidays in present days. Each remaining day deducts one day’s salary.</p>}
      {advances.length>0 && <h3 className="font-semibold">Recover these advances this month</h3>}
      {advances.map(a=><label className="flex gap-2" key={a.advanceId}><input type="checkbox" checked={!deferred.includes(a.advanceId!)} onChange={e=>setDeferred(e.target.checked?deferred.filter(id=>id!==a.advanceId):[...deferred,a.advanceId!])}/>{money(a.amountPaisa)} · {a.reason}</label>)}
      <h3 className="font-semibold">Salary adjustments</h3>
      {lines.map((a, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-2"
        >
          <Label text="Type">
            <select
              className={field}
              value={a.kind}
              onChange={(e) =>
                change(i, { kind: e.target.value as Adjustment["kind"] })
              }
            >
              <option value="ADDITION">Addition</option>
              <option value="DEDUCTION">Deduction</option>
            </select>
          </Label>
          <Label text="Amount (NPR)">
            <input
              className={field}
              type="number"
              min=".01"
              step=".01"
              max="21474836.47"
              required
              value={a.rupees}
              onChange={(e) => change(i, { rupees: e.target.value })}
            />
          </Label>
          <Label text="Label">
            <input
              className={field}
              required
              maxLength={100}
              value={a.label}
              onChange={(e) => change(i, { label: e.target.value })}
            />
          </Label>
          <Label text="Reason">
            <input
              className={field}
              required
              maxLength={500}
              value={a.reason}
              onChange={(e) => change(i, { reason: e.target.value })}
            />
          </Label>
          <button
            className={button}
            type="button"
            onClick={() => setLines(lines.filter((_, j) => j !== i))}
          >
            Remove adjustment
          </button>
        </div>
      ))}
      <button
        className={button}
        type="button"
        onClick={() =>
          setLines([
            ...lines,
            {
              kind: "ADDITION",
              label: "",
              reason: "",
              amountPaisa: 0,
              rupees: "",
            },
          ])
        }
      >
        Add adjustment
      </button>
      <Label
        text={
          row.partialMonth
            ? "Partial-month review note (required)"
            : "Review note"
        }
      >
        <input
          className={field}
          value={note}
          maxLength={500}
          required={row.partialMonth || mode==="OVERRIDE"}
          onChange={(e) => setNote(e.target.value)}
        />
      </Label>
      <button className={primary} disabled={action.isPending}>
        Save review
      </button>
      <ErrorText error={action.error} />
    </form>
  );
}

function PaymentForm({
  month,
  row,
  today,
}: {
  month: string;
  row: Entry;
  today: string;
}) {
  const staff = useQuery({queryKey:[...usePayrollKey(),"staff"],queryFn:payroll.staff});
  const preferred = staff.data?.find(s=>s.id===row.staffId)?.payrollPreference?.method;
  const action = usePayrollAction();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const details = {
      amountPaisa: Math.round(Number(f.get("amount")) * 100),
      method: String(f.get("method")) as Method,
      reference: String(f.get("reference")).trim(),
      paidOn: String(f.get("paidOn")),
    };
    const storageKey = "pending-payroll-" + row.id;
    action.mutate(async () => {
      const signature = JSON.stringify(details);
      const pending = JSON.parse(
        sessionStorage.getItem(storageKey) ?? "null",
      ) as { signature: string; requestId: string } | null;
      const requestId =
        pending?.signature === signature
          ? pending.requestId
          : crypto.randomUUID();
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ signature, requestId }),
      );
      await payroll.pay(month, row.id, { ...details, requestId });
      sessionStorage.removeItem(storageKey);
      form.reset();
    });
  }
  return (
    <form className="space-y-3" onSubmit={submit}>
      <h3 className="font-semibold">Record a salary payment</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <Label text="Amount paid (NPR)">
          <input
            className={field}
            name="amount"
            type="number"
            min=".01"
            max={Math.min(row.outstanding, 2147483647) / 100}
            step=".01"
            required
          />
        </Label>
        <Label text="Payment date (AD)">
          <input
            className={field}
            type="date"
            name="paidOn"
            defaultValue={today}
            max={today}
            required
          />
        </Label>
        <Label text="Method">
          <select className={field} key={preferred} defaultValue={preferred ?? "BANK"} name="method">
            {["BANK", "WALLET", "CASH", "CHEQUE", "OTHER"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Label>
        <Label text="Reference (optional)">
          <input className={field} name="reference" maxLength={150} />
        </Label>
      </div>
      <button disabled={action.isPending} className={primary}>
        Record payment
      </button>
      <ErrorText error={action.error} />
    </form>
  );
}
export default function EntryDetails({
  row,
  month,
  final,
  manage,
  pay,
  today,
}: {
  row: Entry;
  month: string;
  final: boolean;
  manage: boolean;
  pay: boolean;
  today: string;
}) {
  const [slip, setSlip] = useState(false);
  const action = usePayrollAction();
  return (
    <section className={card}>
      <header className="flex flex-wrap justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {row.name} · {row.staffNo}
        </h2>
        {final && (
          <button className={button} onClick={() => setSlip(true)}>
            Salary slip
          </button>
        )}
      </header>
      <p>
        Basic {row.basicPaisa === null ? "—" : money(row.basicPaisa)} ·
        Additions {money(row.additions)} · Deductions {money(row.deductions)}
      </p>
      {final && <Metrics items={[["Salary amount",money(row.net)],["Already paid",money(row.paid)],["Left to pay",money(row.outstanding)]]}/>}
      {final && pay && row.outstanding > 0 && (
        <PaymentForm month={month} row={row} today={today} />
      )}
      {!final && manage ? (
        <DraftReview key={row.revision} row={row} month={month} />
      ) : (
        <>
          {row.leavePaisa > 0 && <p>Unpaid leave deduction · {money(row.leavePaisa)}</p>}
          {row.adjustments.filter(a=>!a.deferred).map((line, i) => (
            <p key={i}>
              {line.kind === "ADDITION" ? "+" : "−"} {money(line.amountPaisa)} ·{" "}
              {line.label} · {line.reason}
            </p>
          ))}
          {row.reviewNote && <p>Review note · {row.reviewNote}</p>}
        </>
      )}
      {final && (
        <>
          <h3 className="font-semibold">Payment history</h3>
          {!row.payments.length && <p>No payments recorded.</p>}
          {row.payments.map((p) => (
            <div className="space-y-2 border-t border-line py-2" key={p.id}>
              <p>
                {dateOnly(p.paidOn)} · {money(p.amountPaisa)} · {p.method}{" "}
                {p.reference}
              </p>
              {p.voidedAt ? (
                <p>Voided · {p.voidReason}</p>
              ) : (
                pay && (
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Void this payment
                    </summary>
                    <form
                      className="flex flex-wrap items-end gap-2 py-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const reason = String(
                          new FormData(e.currentTarget).get("reason"),
                        );
                        action.mutate(() => payroll.void(month, p.id, reason));
                      }}
                    >
                      <Label text="Void reason">
                        <input
                          className={field}
                          required
                          name="reason"
                          maxLength={500}
                        />
                      </Label>
                      <button className={button} disabled={action.isPending}>
                        Confirm void
                      </button>
                    </form>
                  </details>
                )
              )}
            </div>
          ))}
        </>
      )}
      <ErrorText error={action.error} />
      {slip && (
        <SalarySlip entry={row} month={month} close={() => setSlip(false)} />
      )}
    </section>
  );
}
