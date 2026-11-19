"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PrintableDocuments } from "@/components/PrintableDocuments";
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
  childRegister,
  childReport,
  childResults,
  childSummary,
  familyAccount,
  familyDocument,
  familyFees,
  familyHome,
  familyTransaction,
  type ChildTab,
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
            {String(row.issuedOn ?? row.paidOn)} · NPR{" "}
            {String(row.outstanding ?? row.forChild)}
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
  const selected = list.data?.find(
    (r) => r.enrollmentId + "/" + (r.exam?.id ?? "final") === key,
  );
  const params: Record<string, string> = selected
    ? {
        enrollmentId: selected.enrollmentId,
        ...(selected.exam ? { examId: selected.exam.id } : {}),
      }
    : {};
  const report = useQuery({
    queryKey: ["family", id, "report", key],
    queryFn: () => childReport(id, "?" + new URLSearchParams(params)),
    enabled: !!selected,
  });
  return (
    <div className="space-y-4">
      <Failure error={list.error} retry={() => void list.refetch()} />
      {list.isPending && <p>Loading results…</p>}
      {list.data?.length === 0 && <p>No results have been released.</p>}
      {list.data?.map((r) => {
        const k = r.enrollmentId + "/" + (r.exam?.id ?? "final");
        return (
          <button key={k} className={buttonClass} onClick={() => setKey(k)}>
            {r.academicYear.name} · {r.exam?.name ?? "Final result"} ·{" "}
            {r.status}
          </button>
        );
      })}
      <Failure error={report.error} retry={() => void report.refetch()} />
      {report.data && (
        <>
          <RecordDetails value={report.data} />
          <PrintCopy
            key={key}
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
  tab: "profile" | "fees" | "attendance" | "statement";
}) {
  const [range, setRange] = useState<Record<string, string>>({});
  const profile = useQuery({
    queryKey: ["family", id, "profile", {}],
    queryFn: () => childSummary(id, "profile", ""),
    enabled: tab === "attendance",
  });
  const enrollments = profile.data?.enrollments;
  const query = useQuery({
    queryKey: ["family", id, tab, range],
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
                    ? {String(e.className)} ? {String(e.sectionName)}
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
function ChildView({ id }: { id: string }) {
  const [tab, setTab] = useState<ChildTab>("profile");
  const tabs: ChildTab[] = [
    "profile",
    "attendance",
    "results",
    "fees",
    "invoices",
    "payments",
    "statement",
  ];
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="Student records">
        {tabs.map((t) => (
          <button
            aria-pressed={t === tab}
            className={t === tab ? primaryClass : buttonClass}
            key={t}
            onClick={() => setTab(t)}
          >
            {humanLabel(t)}
          </button>
        ))}
      </nav>
      <article className={panelClass}>
        <h2 className="mb-4 text-xl font-semibold">{humanLabel(tab)}</h2>
        {tab === "invoices" || tab === "payments" ? (
          <TransactionList key={tab} id={id} tab={tab} />
        ) : tab === "results" ? (
          <Results id={id} />
        ) : (
          <Summary key={tab} id={id} tab={tab} />
        )}
      </article>
    </div>
  );
}
export default function FamilyWorkspace() {
  const home = useQuery({ queryKey: ["family", "home"], queryFn: familyHome });
  const [child, setChild] = useState("");
  const [view, setView] = useState<"children" | "account" | "fees">("children");
  const family = useQuery({
    queryKey: ["family", view],
    queryFn: view === "account" ? familyAccount : familyFees,
    enabled: view !== "children",
  });
  const selected =
    home.data?.children.find((c) => c.id === child) ?? home.data?.children[0];
  return (
    <section className="mx-auto max-w-5xl space-y-6 text-ink">
      <header>
        <h1 className="text-3xl font-semibold">Family portal</h1>
        {home.data && (
          <p className="mt-2 text-muted">
            {home.data.guardian.name} · {home.data.asOf}
          </p>
        )}
      </header>
      <div className="flex flex-wrap gap-2">
        {(["children", "fees", "account"] as const).map((v) => (
          <button
            key={v}
            className={v === view ? primaryClass : buttonClass}
            onClick={() => setView(v)}
          >
            {v === "fees" ? "Family balances" : humanLabel(v)}
          </button>
        ))}
      </div>
      {view !== "children" ? (
        <div className={panelClass}>
          <Failure error={family.error} retry={() => void family.refetch()} />
          {family.isPending && <p>Loading…</p>}
          {family.data && <RecordDetails value={family.data} />}
        </div>
      ) : (
        <>
          <Failure error={home.error} retry={() => void home.refetch()} />
          {home.isPending && <p>Loading family records…</p>}
          {home.data?.children.length === 0 && (
            <p>No children are linked to this account.</p>
          )}
          {selected && (
            <>
              <div className="grid gap-4 rounded-xl bg-mint p-5 sm:grid-cols-2">
                <Field label="Student">
                  <select
                    className={inputClass}
                    value={selected.id}
                    onChange={(e) => setChild(e.target.value)}
                  >
                    {home.data?.children.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name} · {c.admissionNo}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="self-end">
                  <p>
                    {selected.current &&
                      selected.current.className +
                        " · " +
                        selected.current.sectionName}
                  </p>
                  <p className="font-semibold">
                    Outstanding · NPR {selected.fees?.outstanding ?? 0}
                  </p>
                </div>
              </div>
              <ChildView key={selected.id} id={selected.id} />
            </>
          )}
        </>
      )}
    </section>
  );
}
