"use client";

import Link from "next/link";
import {
  childHref,
  familyPath,
  tabLabels,
  formatNpr,
} from "./family-navigation";
import { FamilyQr } from "@/modules/finance/QrPayments";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PrintableDocuments } from "@/components/PrintableDocuments";
import { StudentProfile } from "@/modules/students/StudentProfile";
import {
  isRecord,
  RecordDetails,
  humanLabel,
} from "@/components/RecordDetails";
import {
  buttonClass,
  Failure,
  Field,
  inputClass,
  panelClass,
  primaryClass,
} from "@/components/ui/WorkspaceFields";
import {
  childProfile,
  childRegister,
  childReport,
  childResults,
  childSummary,
  familyDocument,
  familyHome,
  familyTransaction,
  type ChildTab,
  type Child,
  type FamilyDocument,
} from "./services/portal";

function PrintCopy({
  kind,
  body,
}: {
  kind: FamilyDocument;
  body: Record<string, string>;
}) {
  const print = useMutation({ mutationFn: () => familyDocument(kind, body) });
  return (
    <div className="mt-4 space-y-4">
      <button
        className={buttonClass}
        disabled={print.isPending}
        onClick={() => print.mutate()}
      >
        {print.isPending ? "Preparing…" : "Prepare printable copy"}
      </button>
      <Failure error={print.error} />
      {print.data && <PrintableDocuments batch={print.data} />}
    </div>
  );
}

function TransactionList({
  id,
  tab,
}: {
  id: string;
  tab: "invoices" | "payments";
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState("");
  const list = useQuery({
    queryKey: ["family", id, tab, page, status],
    queryFn: () =>
      childRegister(
        id,
        tab,
        "?" +
          new URLSearchParams({
            page: String(page),
            pageSize: "10",
            ...(status ? { status } : {}),
          }),
      ),
  });
  const detail = useQuery({
    queryKey: ["family", id, tab, "detail", selected],
    queryFn: () => familyTransaction(tab, selected),
    enabled: !!selected,
  });
  return (
    <div className="space-y-4">
      {tab === "invoices" && (
        <Field label="Balance">
          <select
            className={inputClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              setSelected("");
            }}
          >
            <option value="">All invoices</option>
            <option value="OPEN">Outstanding</option>
            <option value="CLOSED">Settled</option>
          </select>
        </Field>
      )}
      <Failure error={list.error} retry={() => void list.refetch()} />
      {list.isPending && <p>Loading…</p>}
      {list.data?.items.length === 0 && <p>No {tab} in this view.</p>}
      {list.data?.items.map((row) => (
        <button
          className="flex min-h-14 w-full flex-wrap justify-between gap-3 rounded-lg border border-line px-4 py-3 text-left"
          key={String(row.id)}
          onClick={() => setSelected(String(row.id))}
        >
          <strong>{String(row.number ?? row.receiptNo)}</strong>
          <span>
            {String(row.issuedOn ?? row.paidOn)} ·{" "}
            {formatNpr(Number(row.outstanding ?? row.forChild))}
          </span>
        </button>
      ))}
      {list.data && list.data.meta.totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={buttonClass}
            disabled={page === 1}
            onClick={() => {
              setPage(page - 1);
              setSelected("");
            }}
          >
            Previous
          </button>
          Page {page} of {list.data.meta.totalPages}
          <button
            className={buttonClass}
            disabled={page >= list.data.meta.totalPages}
            onClick={() => {
              setPage(page + 1);
              setSelected("");
            }}
          >
            Next
          </button>
        </div>
      )}
      {selected && (
        <article className={panelClass}>
          <Failure error={detail.error} retry={() => void detail.refetch()} />
          {detail.isPending && <p>Loading details…</p>}
          {detail.data && (
            <>
              <RecordDetails value={detail.data} />
              <PrintCopy
                key={selected}
                kind={tab === "invoices" ? "invoice" : "receipt"}
                body={
                  tab === "invoices"
                    ? { invoiceId: selected }
                    : { paymentId: selected }
                }
              />
            </>
          )}
        </article>
      )}
    </div>
  );
}

function Results({ id }: { id: string }) {
  const list = useQuery({
    queryKey: ["family", id, "results"],
    queryFn: () => childResults(id),
  });
  const [key, setKey] = useState("");
  const selected =
    list.data?.find(
      (r) => r.enrollmentId + "/" + (r.exam?.id ?? "final") === key,
    ) ?? list.data?.[0];
  const selectedKey = selected
    ? selected.enrollmentId + "/" + (selected.exam?.id ?? "final")
    : "";
  const params: Record<string, string> = selected
    ? {
        enrollmentId: selected.enrollmentId,
        ...(selected.exam ? { examId: selected.exam.id } : {}),
      }
    : {};
  const report = useQuery({
    queryKey: ["family", id, "report", selectedKey],
    queryFn: () => childReport(id, "?" + new URLSearchParams(params)),
    enabled: !!selected,
  });
  return (
    <div className="space-y-4">
      <Failure error={list.error} retry={() => void list.refetch()} />
      {list.isPending && <p>Loading results…</p>}
      {list.data?.length === 0 && <p>No results have been released.</p>}
      {selected && (
        <div className="grid gap-4 rounded-lg bg-background p-4 sm:grid-cols-2">
          <Field label="Released report">
            <select
              className={inputClass}
              value={selectedKey}
              onChange={(e) => setKey(e.target.value)}
            >
              {list.data?.map((r) => {
                const k = r.enrollmentId + "/" + (r.exam?.id ?? "final");
                return (
                  <option key={k} value={k}>
                    {r.academicYear.name} · {r.exam?.name ?? "Final result"}
                  </option>
                );
              })}
            </select>
          </Field>
          <div>
            <p className="text-sm text-muted">Overall result</p>
            <p className="mt-1 text-xl font-semibold">
              {humanLabel(selected.status)}
              {selected.percentage != null && " · " + selected.percentage + "%"}
            </p>
          </div>
        </div>
      )}
      {selected && report.isPending && (
        <p role="status">Loading report card…</p>
      )}
      <Failure error={report.error} retry={() => void report.refetch()} />
      {report.data && (
        <>
          {Array.isArray(report.data.subjects) &&
            report.data.subjects.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="pb-3 text-left text-lg font-semibold">
                    Subject results
                  </caption>
                  <thead className="text-muted">
                    <tr>
                      <th className="py-2 pr-3">Subject</th>
                      <th className="pr-3">Score</th>
                      <th className="pr-3">Grade</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.subjects.filter(isRecord).map((s) => (
                      <tr
                        key={String(s.subjectId)}
                        className="border-t border-line"
                      >
                        <th scope="row" className="py-3 pr-3 font-medium">
                          {String(s.name)}
                        </th>
                        <td className="pr-3 tabular-nums">
                          {typeof s.percentage === "number"
                            ? s.percentage + "%"
                            : "—"}
                        </td>
                        <td>{String(s.grade ?? "—")}</td>
                        <td>{humanLabel(String(s.status))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          {isRecord(report.data.remark) &&
            typeof report.data.remark.text === "string" && (
              <div className="rounded-lg bg-background p-4">
                <h3 className="font-semibold">Teacher’s remark</h3>
                <p>{report.data.remark.text}</p>
              </div>
            )}
          <details className="border-t border-line pt-3">
            <summary className="cursor-pointer py-2 font-semibold">
              Full report card details
            </summary>
            <RecordDetails value={report.data} />
          </details>
          <PrintCopy
            key={selectedKey}
            kind="report-card"
            body={{ studentId: id, ...params }}
          />
        </>
      )}
    </div>
  );
}

function Summary({
  id,
  tab,
}: {
  id: string;
  tab: "fees" | "attendance" | "statement";
}) {
  const [range, setRange] = useState<Record<string, string>>({});
  const profile = useQuery({
    queryKey: ["family", id, "profile"],
    queryFn: () => childProfile(id),
    enabled: tab === "attendance",
  });
  const enrollments = profile.data?.enrollments;
  const query = useQuery({
    queryKey: ["family", id, tab, range],
    refetchInterval: tab === "fees" ? 60000 : false,
    queryFn: () => childSummary(id, tab, "?" + new URLSearchParams(range)),
  });
  return (
    <div className="space-y-5">
      {(tab === "attendance" || tab === "statement") && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setRange(
              Object.fromEntries(
                [...f].filter(([, v]) => v).map(([k, v]) => [k, String(v)]),
              ),
            );
          }}
        >
          {tab === "attendance" && Array.isArray(enrollments) && (
            <Field label="Enrollment">
              <select className={inputClass} name="enrollmentId">
                <option value="">Current enrollment</option>
                {enrollments.filter(isRecord).map((e) => (
                  <option
                    key={String(e.enrollmentId)}
                    value={String(e.enrollmentId)}
                  >
                    {isRecord(e.academicYear)
                      ? String(e.academicYear.name)
                      : ""}{" "}
                    &middot; {String(e.className)} &middot;{" "}
                    {String(e.sectionName)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="From">
            <input type="date" className={inputClass} name="from" />
          </Field>
          <Field label="Through">
            <input type="date" className={inputClass} name="to" />
          </Field>
          <button className={buttonClass}>Apply dates</button>
        </form>
      )}
      <Failure error={query.error} retry={() => void query.refetch()} />
      {query.isPending && <p>Loading…</p>}
      {query.data && <RecordDetails value={query.data} />}
      {tab === "statement" && query.isSuccess && (
        <PrintCopy
          key={JSON.stringify(range)}
          kind="statement"
          body={{ studentId: id, ...range }}
        />
      )}
    </div>
  );
}
function ChildView({ child, tab }: { child: Child; tab: ChildTab }) {
  const id = child.id;
  const profile = useQuery({
    queryKey: ["family", id, "profile"],
    queryFn: () => childProfile(id),
    enabled: tab === "profile",
  });
  return (
    <div className="space-y-4">
      <nav
        className="flex flex-wrap gap-2"
        aria-label={"Records for " + child.name}
      >
        {(Object.keys(tabLabels) as ChildTab[]).map((t) => (
          <Link
            key={t}
            scroll={false}
            href={childHref(child.admissionNo, t)}
            aria-current={t === tab ? "page" : undefined}
            className={
              (t === tab ? primaryClass : buttonClass) +
              " inline-flex items-center"
            }
          >
            {tabLabels[t]}
          </Link>
        ))}
      </nav>
      {tab === "profile" ? (
        <div className="space-y-4">
          <Failure error={profile.error} retry={() => void profile.refetch()} />
          {profile.isPending && <p role="status">Loading student profile…</p>}
          {profile.isSuccess && (
            <>
              <StudentProfile
                photoPath={`/portal/children/${id}/photo`}
                record={profile.data}
                history={profile.data.enrollments}
                current={profile.data.enrollments.find(
                  (e) => e.enrollmentId === child.current?.enrollmentId,
                )}
              />
              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  [
                    "Attendance · last 30 days",
                    child.attendance?.percentage != null
                      ? child.attendance.percentage + "%"
                      : "No attendance recorded",
                  ],
                  [
                    "Latest released result",
                    child.latestResult?.percentage != null
                      ? child.latestResult.percentage + "%"
                      : (child.latestResult?.status ?? "No released result"),
                  ],
                  [
                    "Outstanding fees",
                    child.fees
                      ? "NPR " + child.fees.outstanding.toLocaleString()
                      : "Balance unavailable",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className={panelClass}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      ) : (
        <article className={panelClass}>
          <h2 className="mb-4 text-xl font-semibold">{tabLabels[tab]}</h2>
          {tab === "invoices" || tab === "payments" ? (
            <TransactionList key={tab} id={id} tab={tab} />
          ) : tab === "results" ? (
            <Results id={id} />
          ) : (
            <>
              {tab === "fees" ? (
                <>
                  <FamilyQr key={id} childId={id} />
                  <details className="mt-5 border-t border-line pt-4">
                    <summary className="cursor-pointer font-semibold">
                      Fee breakdown and due dates
                    </summary>
                    <Summary id={id} tab="fees" />
                  </details>
                </>
              ) : (
                <Summary key={tab} id={id} tab={tab} />
              )}
            </>
          )}
        </article>
      )}
    </div>
  );
}
export default function FamilyChildren({
  student,
  view,
}: { student?: string; view?: string } = {}) {
  const home = useQuery({ queryKey: ["family", "home"], queryFn: familyHome });
  const cache = useQueryClient();
  const remembered = cache.getQueryData<string>(["family", "selectedChild"]);
  const selected =
    student !== undefined
      ? home.data?.children.find((c) => c.admissionNo === student)
      : (home.data?.children.find((c) => c.id === remembered) ??
        home.data?.children[0]);
  const tab: ChildTab =
    view && Object.hasOwn(tabLabels, view) ? (view as ChildTab) : "profile";
  return (
    <section className="mx-auto max-w-5xl space-y-5 text-ink">
      <header>
        <Link
          className="inline-flex min-h-11 items-center text-sm font-medium text-teal hover:underline"
          href={familyPath}
        >
          ← Family dashboard
        </Link>
        <h1 className="text-3xl font-semibold">
          {selected?.name ?? "My children"}
        </h1>
        {selected && (
          <p className="mt-1 text-muted">
            {[
              selected.current?.className,
              selected.current?.sectionName,
              "Admission " + selected.admissionNo,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </header>
      <Failure error={home.error} retry={() => void home.refetch()} />
      {home.isPending && <p role="status">Loading family records…</p>}
      {home.isSuccess && !selected && (
        <p className={panelClass}>
          {home.data.children.length
            ? "This student is unavailable. Choose a linked child from your family dashboard."
            : "No children are linked to this account."}
        </p>
      )}
      {home.data && home.data.children.length > 1 && (
        <nav
          aria-label="Choose a child"
          className="flex flex-wrap items-center gap-2 border-b border-line pb-3"
        >
          <span className="mr-1 text-sm text-muted">Choose a child</span>
          {home.data.children.map((c) => (
            <Link
              key={c.id}
              href={childHref(c.admissionNo, tab)}
              aria-current={c.id === selected?.id ? "true" : undefined}
              onClick={() =>
                cache.setQueryData(["family", "selectedChild"], c.id)
              }
              className={
                "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold " +
                (c.id === selected?.id
                  ? "bg-mint text-ink"
                  : "hover:bg-background")
              }
            >
              {c.name} · {c.admissionNo}
            </Link>
          ))}
        </nav>
      )}
      {selected && <ChildView key={selected.id} child={selected} tab={tab} />}
    </section>
  );
}
