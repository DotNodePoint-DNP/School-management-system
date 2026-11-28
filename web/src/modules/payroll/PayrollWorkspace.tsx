"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { payroll, type Entry, type Staff } from "./service";
import {
  PayrollUser,
  usePayrollKey,
  usePayrollAction,
  card,
  field,
  button,
  primary,
  Label,
  MonthPicker,
  Metrics,
  money,
  Status,
  ErrorText,
  dateOnly,
} from "./shared";
import PaidReport from "./PaidReport";
import EntryDetails from "./EntryDetails";
import SalarySlip from "./SalarySlip";
import { AdvanceLog, Arrears, Preference, Supplement } from "./PayrollForms";
import { downloadCsv } from "./csv";

function RegisterTab({
  initialMonth,
  unlock,
  today,
  manage,
  pay,
}: {
  initialMonth: string;
  unlock: boolean;
  today: string;
  manage: boolean;
  pay: boolean;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [filter, setFilter] = useState("All staff");
  const [selected, setSelected] = useState("");
  const action = usePayrollAction();
  const result = useQuery({
    queryKey: [...usePayrollKey(), "register", month],
    queryFn: () => payroll.register(month),
  });
  const r = result.data;
  const final = !!r?.finalizedAt;
  const selectedEntry = r?.entries.find((e) => e.id === selected);
  const visibleEntries = (r?.entries ?? []).filter(e => {
    if (!final || filter === "All staff") return true;
    if (e.supplementalDraft) return filter === "To review";
    return filter === "Balance due" ? e.outstanding > 0 : filter === "Settled" && e.outstanding === 0;
  });
  const total = (key: "net" | "paid" | "outstanding") =>
    money(r?.entries.filter(e=>!final || !e.supplementalDraft).reduce((sum, e) => sum + e[key], 0) ?? 0);
  if (selectedEntry) return <div className="space-y-4">
    <button className={button} onClick={()=>setSelected("")}>← All salaries for {month} BS</button>
    <ErrorText error={action.error}/>
      {selectedEntry?.supplementalDraft && unlock && manage && <button className={primary} disabled={action.isPending} onClick={()=>action.mutate(()=>payroll.lockSupplement(month,selectedEntry.id))}>Lock reviewed staff entry</button>}
      {selectedEntry && (
        <EntryDetails
          key={selectedEntry.id}
          month={month}
          row={selectedEntry}
          final={final && !selectedEntry.supplementalDraft}
          pay={pay}
          manage={manage && (!final || unlock)}
          today={today}
        />
      )}
  </div>;
  return (
    <>
      <section className={card}>
        <h2 className="text-xl font-semibold">Salaries for the month</h2>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <MonthPicker
            value={month}
            onChange={(m) => {
              setMonth(m);
              setSelected("");
              setFilter("All staff");
              action.reset();
            }}
          />
          {manage && r && !final && (
            <div className="flex gap-2">
              <button
                className={r.exists ? button : primary}
                disabled={action.isPending}
                onClick={() => action.mutate(() => payroll.generate(month))}
              >
                {r.exists ? "Update salary list" : "Prepare salaries"}
              </button>
              {r.exists && r.entries.length > 0 && (
                <button
                  className={primary}
                  disabled={
                    action.isPending ||
                    r.entries.some(
                      (e) =>
                        e.basicPaisa === null ||
                        (e.partialMonth && !e.reviewNote) ||
                        e.net < 0,
                    )
                  }
                  onClick={() => action.mutate(() => payroll.finalize(month))}
                >
                  Confirm salaries
                </button>
              )}
            </div>
          )}
        </div>
        <ErrorText error={result.error ?? action.error} />
        {result.isLoading && <p>Loading salaries…</p>}
        {r && (
          <>
            <p className="text-sm text-ink/75">
              {dateOnly(r.startDate)} through {dateOnly(r.endDate)} (AD) ·{" "}
              {final ? "Confirmed" : r.exists ? "Awaiting confirmation" : "Not prepared"}
            </p>
            {manage && r.exists && !final && <p className="text-sm text-ink/75">Review each salary, then confirm the amounts to start recording payments.</p>}
            {r.exists ? (
              <>
                <Metrics
                  items={[
                    ["Total salaries", total("net")],
                    ["Already paid", total("paid")],
                    [final ? "Left to pay" : "Estimated balance", total("outstanding")],
                  ]}
                />
                <button className={button} onClick={()=>downloadCsv("Payroll-"+month,[
                  ["Month (BS)","Staff code","Name","Total days","Present days","Base (NPR)","Additions","Leave deduction","Total deductions","Net","Paid","Due","Status"],
                  ...r.entries.map(e=>[month,e.staffNo,e.name,e.totalDays,e.presentDays,e.basicPaisa===null?null:e.basicPaisa/100,e.additions/100,e.leavePaisa/100,e.deductions/100,e.net/100,e.paid/100,e.outstanding/100,(!final||e.supplementalDraft)?"Draft":e.outstanding<=0?"Paid":e.paid?"Partial":"Unpaid"])
                ])}>Download CSV</button>
                {manage && unlock && final && <Supplement month={month} entries={r.entries} select={setSelected}/>}

                {final && <div className="flex flex-wrap gap-2" aria-label="Filter salary list">
                  {["All staff","Balance due","Settled",...(r.entries.some(e=>e.supplementalDraft)?["To review"]:[])].map(value=>(
                    <button key={value} className={filter===value?primary:button} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value}</button>
                  ))}
                </div>}
                {!r.entries.length ? (
                  <p>No eligible staff in this month.</p>
                ) : !visibleEntries.length ? <p>No staff match this filter.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-left text-sm">
                      <thead>
                        <tr>
                          {[
                            "Staff",
                            "Salary amount",
                            "Paid",
                            final ? "Left to pay" : "Estimated balance",
                            "Status",
                            "Action",
                          ].map((t) => (
                            <th className="p-2" key={t}>
                              {t}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEntries.map((e) => (
                          <tr className="border-t border-line" key={e.id}>
                            <td className="p-2">
                              <button
                                className="font-semibold underline underline-offset-4"
                                onClick={() => setSelected(e.id)}
                              >
                                {e.name} · {e.staffNo}
                              </button>
                            </td>
                            <td className="p-2">
                              {e.basicPaisa === null ? "—" : money(e.net)}
                            </td>
                            <td className="p-2">{money(e.paid)}</td>
                            <td className="p-2">
                              {e.basicPaisa === null
                                ? "—"
                                : money(e.outstanding)}
                            </td>
                            <td className="p-2">
                              <Status final={final && !e.supplementalDraft} net={e.net} paid={e.paid} />
                              {e.basicPaisa === null ? " · Missing rate" : ""}
                              {e.partialMonth && !e.reviewNote
                                ? " · Review partial month"
                                : ""}
                            </td>
                            <td className="p-2"><button className={button} onClick={()=>setSelected(e.id)}>
                              {!final || e.supplementalDraft ? (manage && (!final || unlock) ? "Review salary" : "View salary") : pay && e.outstanding>0 ? "Record payment" : "View details"}
                            </button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {manage && unlock &&
                  final &&
                  r.entries.every((e) => !e.payments.length) && (
                    <details>
                      <summary className="cursor-pointer">Reopen month</summary>
                      <form
                        className="flex flex-wrap items-end gap-2 pt-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const reason = String(
                            new FormData(e.currentTarget).get("reason"),
                          );
                          action.mutate(async () => { await payroll.reopen(month, reason); setFilter("All staff"); });
                        }}
                      >
                        <Label text="Reason">
                          <input
                            className={field}
                            name="reason"
                            maxLength={500}
                            required
                          />
                        </Label>
                        <button className={button} disabled={action.isPending}>
                          Reopen for editing
                        </button>
                      </form>
                    </details>
                  )}
              </>
            ) : (
              <p>Salaries have not been prepared for this month.</p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function StaffPicker({
  staff,
  id,
  onChange,
}: {
  staff: Staff[];
  id: string;
  onChange: (id: string) => void;
}) {
  return (
    <Label text="Staff member">
      <select
        className={field}
        value={id}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select staff</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")}{" "}
            · {s.staffNo}
            {s.status === "LEFT" ? " (left)" : ""}
          </option>
        ))}
      </select>
    </Label>
  );
}
function StaffTab({
  openMonth,
  initialId,
  history,
  today,
  pay,
  month,
  manage,
}: {
  initialId?: string;
  openMonth: (month:string)=>void;
  history: boolean;
  today: string;
  pay: boolean;
  month: string;
  manage: boolean;
}) {
  const key = usePayrollKey();
  const staff = useQuery({
    queryKey: [...key, "staff"],
    queryFn: payroll.staff,
  });
  const [id, setId] = useState(initialId ?? "");
  const [effective, setEffective] = useState(month);
  const [slip, setSlip] = useState<(Entry & { month: string }) | null>(null);
  const rows = useQuery({
    queryKey: [...key, "history", id],
    queryFn: () => payroll.history(id),
    enabled: history && !!id,
  });
  const action = usePayrollAction();
  const person = staff.data?.find((s) => s.id === id);
  return (
    <section className={card}>
      <h2 className="text-xl font-semibold">
        {history ? "Staff balances and payments" : "Salary setup"}
      </h2>
      <ErrorText error={staff.error ?? rows.error ?? action.error} />
      {staff.isLoading ? (
        <p>Loading staff…</p>
      ) : (
        <StaffPicker
          staff={staff.data ?? []}
          id={id}
          onChange={(value) => {
            setId(value);
            action.reset();
          }}
        />
      )}
      {person && !history && (
        <>
          <Preference key={id} staff={person} manage={manage}/>
          <h3 className="font-semibold">Monthly basic salary</h3>
          {!person.salaryRates.length && <p>No salary rate on file.</p>}
          {person.salaryRates.map((r) => (
            <p key={r.effectiveMonth}>
              From {r.effectiveMonth} BS · {money(r.basicPaisa)}
            </p>
          ))}
          {manage && (
            <form
              key={id}
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const amount = Math.round(
                  Number(new FormData(e.currentTarget).get("amount")) * 100,
                );
                action.mutate(() => payroll.rate(id, effective, amount));
              }}
            >
              <MonthPicker value={effective} onChange={setEffective} />
              <Label text="Monthly rate (NPR)">
                <input
                  type="number"
                  className={field}
                  min=".01"
                  step=".01"
                  max="21474836.47"
                  name="amount"
                  required
                />
              </Label>
              <button className={primary} disabled={action.isPending}>
                Save rate from this month
              </button>
            </form>
          )}
          <button className={button} onClick={()=>openMonth(effective)}>View salaries for {effective} BS</button>
          {action.isSuccess && (
            <p role="status">
              Salary saved. This rate carries forward until you change it.{" "}

            </p>
          )}
        </>
      )}
      {history && id && (
        <>
          {rows.isLoading && <p>Loading history…</p>}
          {rows.data?.length === 0 && (
            <p>No salary records for this staff member.</p>
          )}
          {person && rows.data && <Arrears key={id} staff={person} rows={rows.data} today={today} pay={pay}/>}
          {rows.data?.map((e) => (
            <div key={e.id} className="space-y-2 border-t border-line py-3">
              <h3 className="font-semibold">
                {e.month} BS ·{" "}
                <Status final={!!e.finalizedAt} net={e.net} paid={e.paid} />
              </h3>
              <p>
                Salary {money(e.net)} · Paid {money(e.paid)} · Left to pay{" "}
                {money(e.outstanding)}
              </p>
              {e.finalizedAt && (
                <button className={button} onClick={() => setSlip(e)}>
                  Salary slip
                </button>
              )}
            </div>
          ))}
        </>
      )}
      {slip && (
        <SalarySlip
          entry={slip}
          month={slip.month}
          close={() => setSlip(null)}
        />
      )}
    </section>
  );
}
function Workspace({ manage, pay, unlock, initialId }: { manage: boolean; pay: boolean; unlock:boolean; initialId?:string }) {
  const now = useQuery({
    queryKey: [...usePayrollKey(), "today"],
    queryFn: payroll.today,
  });
  const [salaryMonth,setSalaryMonth]=useState("");
  const [tab, setTab] = useState(initialId ? "Salary setup" : "Monthly salaries");
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 text-ink sm:p-8">
      <h1 className="text-2xl font-semibold">Staff payroll</h1>
      <nav aria-label="Payroll sections" className="flex flex-wrap gap-2">
        {[
          "Monthly salaries",
          "Staff balances",
          "Advances",
          "Payment report",
          "Salary setup",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? primary : button}
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <ErrorText error={now.error} />
      {now.isLoading && <p>Loading payroll…</p>}
      {now.data && !now.data.month && (
        <p>The current date is outside the supported BS calendar.</p>
      )}
      {now.data?.month && (
        <>
          {tab === "Monthly salaries" && (
            <RegisterTab
              unlock={unlock}
              initialMonth={salaryMonth || now.data.month}
              today={now.data.date}
              manage={manage}
              pay={pay}
            />
          )}
          {(tab === "Salary setup" || tab === "Staff balances") && (
            <StaffTab
              key={tab}
              openMonth={m=>{setSalaryMonth(m);setTab("Monthly salaries");}}
              today={now.data.date}
              pay={pay}
              initialId={initialId}
              history={tab === "Staff balances"}
              month={now.data.month}
              manage={manage}
            />
          )}
          {tab === "Advances" && <AdvanceLog today={now.data.date} pay={pay}/>}
          {tab === "Payment report" && (
            <PaidReport initialMonth={now.data.month} today={now.data.date} />
          )}
        </>
      )}
    </main>
  );
}
export default function PayrollWorkspace({
  initialId,
  userId,
  unlock,
  manage,
  pay,
}: {
  initialId?: string;
  userId: string;
  unlock: boolean;
  manage: boolean;
  pay: boolean;
}) {
  return (
    <PayrollUser.Provider value={userId}>
      <Workspace manage={manage} pay={pay} unlock={unlock} initialId={initialId} />
    </PayrollUser.Provider>
  );
}
