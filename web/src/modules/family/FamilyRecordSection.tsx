"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  buttonClass,
  Failure,
  panelClass,
  primaryClass,
} from "@/components/ui/WorkspaceFields";
import { RecordDetails, humanLabel } from "@/components/RecordDetails";
import { familyAccount, familyFees } from "./services/portal";
import { childHref, familyPath, formatNpr } from "./family-navigation";

const ageingLabels: Record<string, string> = {
  CURRENT: "Not yet due",
  D1_30: "1–30 days overdue",
  D31_60: "31–60 days overdue",
  D61_90: "61–90 days overdue",
  D90_PLUS: "Over 90 days overdue",
};
function Balance() {
  const q = useQuery({
    queryKey: ["family", "fees"],
    queryFn: familyFees,
    refetchInterval: 60000,
  });
  return (
    <>
      <Failure error={q.error} retry={() => void q.refetch()} />
      {q.isPending && <p role="status">Loading balances…</p>}
      {q.data && (
        <>
          <p className="text-sm text-muted">As of {q.data.asOf}</p>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ["Outstanding", q.data.totals.outstanding],
                ["Overdue", q.data.totals.overdue],
                ["Not yet due", q.data.totals.notYetDue],
                ["Advance credit", q.data.totals.credit],
              ] as const
            ).map(([label, n]) => (
              <div className={panelClass} key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {formatNpr(n)}
                </dd>
              </div>
            ))}
          </dl>
          {q.data.children.length === 0 && (
            <p>No children are linked to this account.</p>
          )}
          {q.data.children.map((c) => (
            <article key={c.student.id} className={panelClass + " space-y-3"}>
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{c.student.name}</h2>
                  <p className="text-sm text-muted">
                    Admission {c.student.admissionNo}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted">Outstanding</p>
                  <strong>{formatNpr(c.outstanding)}</strong>
                </div>
              </header>
              <p>
                {c.openInvoices} open{" "}
                {c.openInvoices === 1 ? "invoice" : "invoices"}
                {c.oldestDueDate && " · Earliest due date " + c.oldestDueDate}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={childHref(c.student.admissionNo, "fees")}
                  className={primaryClass + " inline-flex items-center"}
                >
                  {c.outstanding > 0 ? "Pay fees" : "View fees"}
                </Link>
                <Link
                  href={childHref(c.student.admissionNo, "statement")}
                  className={buttonClass + " inline-flex items-center"}
                >
                  Fee statement
                </Link>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Balance breakdown
                </summary>
                <div className="mt-2 space-y-1 text-sm">
                  <p>Overdue {formatNpr(c.overdue)}</p>
                  <p>Advance credit {formatNpr(c.credit)}</p>
                  {Object.entries(c.buckets).map(([k, n]) => (
                    <p key={k}>
                      {ageingLabels[k] ?? humanLabel(k)} · {formatNpr(n)}
                    </p>
                  ))}
                </div>
              </details>
            </article>
          ))}
        </>
      )}
    </>
  );
}
function Account() {
  const q = useQuery({
    queryKey: ["family", "account"],
    queryFn: familyAccount,
  });
  return (
    <>
      <Failure error={q.error} retry={() => void q.refetch()} />
      {q.isPending && <p role="status">Loading account…</p>}
      {q.data && (
        <>
          <div className={panelClass}>
            <h2 className="text-sm text-muted">Guardian</h2>
            <p className="text-xl font-semibold">{q.data.guardian.name}</p>
          </div>
          <h2 className="text-xl font-semibold">Linked children</h2>
          {q.data.children.length === 0 && (
            <p>No children are linked to this account.</p>
          )}
          {q.data.children.map((c) => (
            <article key={c.id} className={panelClass + " space-y-2"}>
              <h3 className="font-semibold">{c.name}</h3>
              <p className="text-sm">
                Admission {c.admissionNo} · {humanLabel(c.relationship)}
                {c.isPrimary ? " · Primary guardian" : ""}
              </p>
              <Link
                className="inline-flex min-h-11 items-center text-teal hover:underline"
                href={childHref(c.admissionNo, "profile")}
              >
                View student profile
              </Link>
              <details>
                <summary className="cursor-pointer text-sm">
                  Enrollment and account details
                </summary>
                <RecordDetails value={c} />
              </details>
            </article>
          ))}
        </>
      )}
    </>
  );
}
export function FamilyRecordSection({
  section,
}: {
  section: "balance" | "account";
}) {
  return (
    <section className="mx-auto max-w-5xl space-y-5 text-ink">
      <header>
        <Link
          className="inline-flex min-h-11 items-center text-sm text-teal hover:underline"
          href={familyPath}
        >
          ← Family dashboard
        </Link>
        <h1 className="text-3xl font-semibold">
          {section === "balance" ? "Family balance" : "My account"}
        </h1>
      </header>
      {section === "balance" ? <Balance /> : <Account />}
    </section>
  );
}
