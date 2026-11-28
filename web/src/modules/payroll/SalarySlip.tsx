"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Entry } from "./service";
import { button, money, dateOnly, Status } from "./shared";

export default function SalarySlip({
  entry,
  month,
  close,
}: {
  entry: Entry;
  month: string;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-label="Salary slip"
      onCancel={close}
      className="payroll-slip fixed inset-0 m-auto max-h-[90vh] w-[min(94vw,640px)] overflow-auto rounded-xl border border-line bg-panel p-7 text-ink backdrop:bg-black/40"
    >
      <style>
        {
          "@media print { body:has(> .payroll-slip) > :not(.payroll-slip) {display:none!important} .payroll-slip[open]{position:static!important;display:block!important;max-height:none!important;width:100%!important;overflow:visible!important;color:black!important;background:white!important;border:none!important} .payroll-slip::backdrop{background:white} }"
        }
      </style>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Salary slip</h2>
        <p>
          {month} BS · {entry.staffNo}
        </p>
        <h3 className="text-lg font-semibold">{entry.name}</h3>
        {entry.designation && <p>{entry.designation}</p>}
        <dl className="space-y-2">
          <div className="flex justify-between">
            <dt>Basic salary</dt>
            <dd>{money(entry.basicPaisa ?? 0)}</dd>
          </div>
          {entry.presentDays!==null && <div><dt>Present days</dt><dd>{entry.presentDays} of {entry.totalDays}</dd></div>}
          {entry.leavePaisa>0 && <div className="flex justify-between"><dt>Unpaid leave</dt><dd>−{money(entry.leavePaisa)}</dd></div>}
          {entry.adjustments.filter(a=>!a.deferred).map((a, i) => (
            <div className="flex justify-between gap-3" key={i}>
              <dt>
                {a.label} · {a.reason}
              </dt>
              <dd>
                {a.kind === "DEDUCTION" ? "−" : "+"}
                {money(a.amountPaisa)}
              </dd>
            </div>
          ))}
          {(
            [
              ["Net salary", entry.net],
              ["Paid", entry.paid],
              ["Outstanding", entry.outstanding],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between border-t border-line pt-2 font-semibold"
            >
              <dt>{label}</dt>
              <dd>{money(value)}</dd>
            </div>
          ))}
        </dl>
        <p>
          <Status final net={entry.net} paid={entry.paid} />
        </p>
        <h3 className="font-semibold">Payment history</h3>
        {entry.payments.length === 0 && <p>No payments recorded.</p>}
        {entry.payments.map((p) => (
          <p key={p.id}>
            {dateOnly(p.paidOn)} · {p.method} · {money(p.amountPaisa)}{" "}
            {p.reference}
            {p.voidedAt && " · Voided: " + p.voidReason}
          </p>
        ))}
        <div className="flex gap-2 print:hidden">
          <button className={button} onClick={() => window.print()}>
            Print slip
          </button>
          <button className={button} onClick={close}>
            Close
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
