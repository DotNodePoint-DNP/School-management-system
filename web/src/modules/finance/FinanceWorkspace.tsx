"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAcademicYears,
  listSchoolClasses,
} from "@/modules/settings/services/academic-setup";
import { FinanceResult } from "./components/FinanceResult";
import { isRecord } from "@/components/RecordDetails";
import { PrintableDocuments } from "@/components/PrintableDocuments";
import { listFeeHeads, listFiscalYears } from "./services/setup";
import { forms, workflows, type Workflow } from "./services/workflows";
import { requestWorkflow, resourceKey, type Values } from "./services/requests";
import { RecordFinder } from "./components/RecordFinder";
import { toast } from "sonner";
import {
  WorkflowField,
  formPayload,
  type Options,
} from "./components/WorkflowFields";
import {
  Failure,
  Field,
  inputClass,
  primaryClass,
  buttonClass,
  panelClass,
} from "@/components/ui/WorkspaceFields";

const previews: Record<string, string> = {
  "/invoices/generate": "/invoices/preview",
  "/invoices/:id/reissue": "/invoices/:id/reissue/preview",
  "/late-fines/apply": "/late-fines/preview",
  "/reminders/fees/send": "/reminders/fees/preview",
};
function guardFigures(path: string, preview: Values) {
  if (path === "/invoices/generate")
    return { expect: { count: preview.willCreate, netTotal: preview.net } };
  if (path.endsWith("/reissue")) return { expectNet: preview.net };
  if (path.endsWith("/send"))
    return { expect: { recipients: preview.recipients, total: preview.total } };
  return { expect: { count: preview.count, total: preview.total } };
}

function Operation({
  action,
  options,
  permissions,
}: {
  action: Workflow;
  options: Options;
  permissions: string[];
}) {
  const [draft, setDraft] = useState<Values>({});
  const queryClient = useQueryClient();
  const [refs, setRefs] = useState<Values>({});
  const [result, setResult] = useState<unknown>();
  const [preview, setPreview] = useState<Values>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [requestKey, setRequestKey] = useState("");
  const [audience, setAudience] = useState("");
  const scoped = [
    "InvoiceRunDto",
    "ReminderRunDto",
    "PrintFeeVouchersDto",
  ].includes(action.form ?? "");
  const selectors = [
    "classId",
    "sectionId",
    action.form === "InvoiceRunDto" ? "enrollmentIds" : "studentIds",
    "all",
  ];
  const schema = forms[action.form ?? ""] ?? [];
  const previewPath = previews[action.path];
  const write =
    action.method !== "get" &&
    !action.path.includes("/preview") &&
    !action.path.startsWith("/print/");
  const structure =
    action.method === "put" &&
    action.path.endsWith("/fee-structure") &&
    permissions.includes("fees:read");
  const dayClose =
    action.method === "post" &&
    action.path === "/day-closes" &&
    permissions.includes("fees:reports");
  const [prepared, setPrepared] = useState(false);
  const [cashiers, setCashiers] = useState<Options["cashierId"]>([]);
  const prepare = (structure || dayClose) && !prepared;
  const pathKeys = Array.from(action.path.matchAll(/:(\w+)/g), (m) =>
    resourceKey(action.path, m[1]),
  );
  function changed() {
    setPreview(undefined);
    setResult(undefined);
    setError(undefined);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (
      !prepare &&
      write &&
      (!previewPath || preview) &&
      !window.confirm(action.label + " with these details?")
    )
      return;
    setBusy(true);
    setError(undefined);
    try {
      if (prepare) {
        if (structure) {
          const current = await requestWorkflow(
            { ...action, method: "get" },
            refs,
            {},
          );
          if (!isRecord(current) || !Array.isArray(current.lines))
            throw new Error("Unable to load the class fee structure.");
          setDraft({
            lines: current.lines.map((line) => ({
              feeHeadId: line.feeHead.id,
              amount: line.amount,
              audience: line.audience,
              onAdmission: line.onAdmission,
              periodIds: line.periods
                .map((p: { id: string }) => p.id)
                .join(","),
            })),
          });
        } else {
          const date = draft.date;
          const current = await requestWorkflow(
            { ...action, method: "get" },
            refs,
            date ? { date } : {},
            "/day-closes/preview",
          );
          if (
            !isRecord(current) ||
            !isRecord(current.figures) ||
            !Array.isArray(current.figures.cashiers)
          )
            throw new Error("Invalid day close preview.");
          if (!current.canClose)
            throw new Error(
              Array.isArray(current.problems)
                ? current.problems.join(" ")
                : "This day cannot be closed.",
            );
          const staff = current.figures.cashiers.filter((c) => c.cashCount > 0);
          setCashiers(
            staff.map((c) => ({
              id: c.cashier.id,
              name: c.cashier.name ?? c.cashier.id,
            })),
          );
          setDraft({
            date: current.date,
            lines: staff.map((c) => ({ cashierId: c.cashier.id })),
            expect: {
              receiptCount: current.figures.receiptCount,
              expectedCash: current.figures.expectedCash,
            },
          });
          setResult(current);
        }
        setPrepared(true);
        return;
      }
      const payload = formPayload(schema, draft);
      if (scoped) {
        for (const field of selectors)
          if (field !== audience) delete payload[field];
        if (audience === "all") payload.all = true;
        else if (!payload[audience])
          throw new Error("Select a record for the chosen audience.");
      }
      if (action.form === "InvoiceRunDto") {
        if (payload.kind === "PERIODIC") {
          delete payload.academicYearId;
          delete payload.dueDate;
          delete payload.dueDateBs;
          if (!payload.periodId) throw new Error("Select a billing period.");
        } else {
          delete payload.periodId;
          if (!payload.academicYearId)
            throw new Error("Select the admission year.");
        }
      }
      if (
        action.form === "RecordPaymentDto" ||
        action.form === "ApplyCreditDto"
      ) {
        if (
          Boolean(payload.autoAllocate) ===
          Boolean(
            Array.isArray(payload.allocations) && payload.allocations.length,
          )
        )
          throw new Error(
            "Choose either individual invoice allocations or automatic allocation.",
          );
      }
      if (
        (action.form === "RecordPaymentDto" ||
          action.form === "RefundCreditDto") &&
        payload.method !== "CASH" &&
        !payload.reference
      )
        throw new Error("Enter the transaction or cheque reference.");

      for (const key of ["requestKey", "idempotencyKey"])
        if (schema.some((f) => f.key === key)) {
          const stable = requestKey || crypto.randomUUID();
          setRequestKey(stable);
          payload[key] = stable;
        }
      if (previewPath && !preview) {
        const value = await requestWorkflow(action, refs, payload, previewPath);
        if (!isRecord(value)) throw new Error("Invalid preview response.");
        setPreview(value);
        setResult(value);
        return;
      }
      const value = await requestWorkflow(
        action,
        refs,
        preview
          ? { ...payload, ...guardFigures(action.path, preview) }
          : payload,
      );
      setResult(value);
      setComplete(write);
      setPreview(undefined);
      if (write) await queryClient.invalidateQueries({ queryKey: ["finance"] });
    } catch (e) {
      setError(e);
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {!complete && (
        <form onSubmit={submit} className={panelClass}>
          <fieldset disabled={busy} className="space-y-5">
            <legend className="mb-3 text-xl font-semibold">
              {action.label}
            </legend>
            {scoped && (
              <Field label="Who is included?">
                <select
                  className={inputClass}
                  required
                  value={audience}
                  onChange={(e) => {
                    changed();
                    setAudience(e.target.value);
                  }}
                >
                  <option value="">Select audience</option>
                  {selectors.map((key, index) => (
                    <option value={key} key={key}>
                      {
                        [
                          "One class",
                          "One section",
                          "Selected students",
                          "All eligible students",
                        ][index]
                      }
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {(!prepared || !structure) &&
                pathKeys.map((key) => (
                  <WorkflowField
                    key={key}
                    field={{ key, type: "text", required: true }}
                    value={refs[key]}
                    options={options}
                    change={(v) => {
                      changed();
                      setRefs({ ...refs, [key]: v });
                    }}
                  />
                ))}
              {schema
                .filter(
                  (f) =>
                    (!scoped ||
                      !selectors.includes(f.key) ||
                      (f.key === audience && f.key !== "all")) &&
                    (action.form !== "InvoiceRunDto" ||
                      ((f.key !== "periodId" || draft.kind === "PERIODIC") &&
                        (!["academicYearId", "dueDate", "dueDateBs"].includes(
                          f.key,
                        ) ||
                          draft.kind === "ADMISSION"))) &&
                    (!prepare || (dayClose && f.key === "date")) &&
                    (!dayClose ||
                      !prepared ||
                      !["expect", "date", "dateBs"].includes(f.key)) &&
                    !["idempotencyKey", "requestKey"].includes(f.key) &&
                    (!(previewPath || action.path.endsWith("/preview")) ||
                      !["expect", "expectNet"].includes(f.key)),
                )
                .map((f) => (
                  <WorkflowField
                    key={f.key}
                    field={f}
                    value={draft[f.key]}
                    options={{
                      ...options,
                      ...(cashiers.length ? { cashierId: cashiers } : {}),
                    }}
                    change={(v) => {
                      changed();
                      setDraft({ ...draft, [f.key]: v });
                    }}
                  />
                ))}
            </div>
            <Failure error={error} />
            <button className={primaryClass}>
              {busy
                ? "Working…"
                : prepare
                  ? structure
                    ? "Load class structure"
                    : "Review day figures"
                  : previewPath && !preview
                    ? "Review preview"
                    : action.label}
            </button>
          </fieldset>
        </form>
      )}
      {result !== undefined && (
        <section aria-live="polite" className={panelClass}>
          <h2 className="mb-4 text-lg font-semibold">
            {preview ? "Preview" : complete ? "Saved" : action.label}
          </h2>
          {isRecord(result) && Array.isArray(result.documents) ? (
            <PrintableDocuments batch={result} />
          ) : (
            <FinanceResult value={result} />
          )}
          {complete && (
            <button
              className={buttonClass + " mt-4"}
              onClick={() => {
                setComplete(false);
                setAudience("");
                setPrepared(false);
                setRequestKey("");
                setDraft({});
                setRefs({});
                changed();
              }}
            >
              Start another
            </button>
          )}
        </section>
      )}
    </div>
  );
}
export default function FinanceWorkspace({
  section,
  title,
  permissions,
}: {
  section: string;
  title: string;
  permissions: string[];
}) {
  const available = (workflows[section] ?? []).filter((a) =>
    a.permissions.some((p) => permissions.includes(p)),
  );
  const [selection, setSelection] = useState("");
  const [matches, setMatches] = useState<Options>({});
  const action = available.find((a) => a.label === selection) ?? available[0];
  const years = useQuery({
    queryKey: ["finance", "academic-years"],
    queryFn: listAcademicYears,
    enabled: permissions.includes("academic-years:read"),
  });
  const classes = useQuery({
    queryKey: ["finance", "classes"],
    queryFn: listSchoolClasses,
    enabled: permissions.includes("classes:read"),
  });
  const heads = useQuery({
    queryKey: ["finance", "heads"],
    queryFn: listFeeHeads,
    enabled: permissions.includes("fees:read"),
  });
  const fiscal = useQuery({
    queryKey: ["finance", "years", "list"],
    queryFn: listFiscalYears,
    enabled: permissions.includes("fees:read"),
  });
  const options: Options = {
    ...matches,
    yearId: years.data ?? [],
    academicYearId: years.data ?? [],
    sourceYearId: years.data ?? [],
    classId: classes.data ?? [],
    sectionId:
      classes.data?.flatMap((c) =>
        c.sections.map((s) => ({ id: s.id, name: c.name + " · " + s.name })),
      ) ?? [],
    feeHeadId: heads.data ?? [],
    fiscalYearId: fiscal.data?.map((y) => ({ id: y.id, name: y.label })) ?? [],
  };
  if (!action) return null;
  return (
    <section className="mx-auto max-w-6xl space-y-6 text-ink">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="lg:hidden">
          <Field label="Task">
            <select
              className={inputClass}
              value={action.label}
              onChange={(e) => setSelection(e.target.value)}
            >
              {available.map((a) => (
                <option key={a.label}>{a.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <nav
          aria-label={title}
          className="hidden self-start rounded-xl border border-line bg-panel p-2 lg:grid"
        >
          {available.map((a) => (
            <button
              key={a.label}
              aria-pressed={action === a}
              className={
                "min-h-11 rounded-md px-3 text-left text-sm " +
                (action === a
                  ? "bg-mint font-semibold text-ink"
                  : "text-muted hover:bg-background")
              }
              onClick={() => setSelection(a.label)}
            >
              {a.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <RecordFinder
            options={options}
            permissions={permissions}
            choose={(key, r) => {
              setMatches((prev) => ({
                ...prev,
                [key]: [r, ...(prev[key] ?? []).filter((x) => x.id !== r.id)],
              }));
              toast.success(r.name + " added to the form choices.");
            }}
          />
          <Operation
            key={section + action.label}
            action={action}
            options={options}
            permissions={permissions}
          />
        </div>
      </div>
    </section>
  );
}
