"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import { createApiClient } from "@/lib/api/client";

type Qr = { id: string; merchant: string };
type Person = {
  firstName: string;
  middleName: string | null;
  lastName: string | null;
};
type Claim = {
  trackingNumber: number;
  id: string;
  amount: string;
  transferredOn: string;
  createdAt: string;
  status: string;
  student: Person & { id: string; admissionNo: string };
  guardian: Person;
  qr: Qr;
  allocations: {
    amount: string;
    outstanding: number;
    invoice: { number: string };
  }[];
  events: {
    id: string;
    status: string;
    reference: string | null;
    note: string | null;
    hasImage: boolean;
  }[];
  payment: {
    receiptNo: string;
    paidOn: string;
    payerName: string | null;
    allocations: {
      amount: string;
      invoice: { number: string; student: { admissionNo: string } };
    }[];
    reversal: { reversedAt: string } | null;
  } | null;
};
type Options = {
  qr: Qr | null;
  dues: {
    student: { name: string; admissionNo: string };
    outstanding: number;
    invoices: {
      id: string;
      number: string;
      period: string | null;
      outstanding: number;
    }[];
  };
};
const statusNames: Record<string, string> = {
  PENDING: "Awaiting verification",
  CLARIFICATION: "More evidence requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};
const api = createApiClient;
const field =
  "mt-1 block w-full rounded-lg border border-line bg-background px-3 py-2.5 text-ink focus-visible:outline-2";
const button = "rounded border px-4 py-2 font-medium disabled:opacity-50";
const card = "space-y-3 rounded-xl border bg-white p-4";
const money = (n: number | string) =>
  "NPR " + Number(n).toLocaleString("en-NP", { maximumFractionDigits: 2 });
const name = (p: Person) =>
  [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
function Feedback({ error }: { error: Error | null }) {
  return (
    error && (
      <p role="alert" className="text-red-700">
        {error.message}
      </p>
    )
  );
}
function useWrite() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api().post(path, body),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["qr"] }),
        cache.invalidateQueries({ queryKey: ["family"] }),
      ]);
    },
  });
}
function FileField({
  required = false,
  onSelect,
}: {
  required?: boolean;
  onSelect?: (f: File | null) => void;
}) {
  return (
    <label>
      {" "}
      {required ? "School QR image" : "Transfer screenshot (optional)"}
      <input
        name="image"
        className={field}
        required={required}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.setCustomValidity(
            file && file.size > 5 * 1024 * 1024
              ? "Choose an image under 5 MB"
              : "",
          );
          onSelect?.(file ?? null);
        }}
      />
    </label>
  );
}
function useImageUrl(file?: Blob | null) {
  const [loaded, setLoaded] = useState<{ file: Blob; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLoaded({ file, url: String(reader.result) });
    reader.readAsDataURL(file);
    return () => {
      reader.onload = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);
  return loaded && loaded.file === file ? loaded.url : "";
}
function PrivateImage({ path, alt }: { path: string; alt: string }) {
  const query = useQuery({
    queryKey: ["qr", "image", path],
    queryFn: () => api().getBlob(path),
    gcTime: 0,
  });
  const url = useImageUrl(query.data);
  return (
    <>
      <Feedback error={query.error} />
      {url && (
        <Image
          unoptimized
          width={500}
          height={500}
          className="max-h-96 max-w-full object-contain"
          src={url}
          alt={alt}
        />
      )}
    </>
  );
}
function formData(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  for (const [k, v] of [...data])
    if (v === "" || (v instanceof File && !v.size)) data.delete(k);
  return data;
}
function EvidenceFields() {
  return (
    <>
      <label>
        Transaction reference
        <input name="reference" className={field} maxLength={60} />
      </label>
      <FileField />
    </>
  );
}

export function FamilyQr({ childId }: { childId: string }) {
  const base = "/portal/children/" + childId + "/qr";
  const query = useQuery({
    queryKey: ["qr", "options", childId],
    refetchInterval: 60000,
    queryFn: () => api().get<Options>(base),
  });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [payQr, setPayQr] = useState<Qr | null>(null);
  const [evidenceError, setEvidenceError] = useState(false);
  const requestKey = useRef("");
  const write = useWrite();
  const dues = query.data?.dues;
  const allocations = Object.entries(amounts)
    .filter(([, v]) => Number(v) > 0)
    .map(([invoiceId, v]) => ({ invoiceId, amount: Number(v) }));
  const total =
    allocations.reduce((sum, a) => sum + Math.round(a.amount * 100), 0) / 100;
  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">Pay by school QR</h3>
        <a
          className="inline-flex min-h-11 items-center text-sm font-semibold text-teal hover:underline"
          href="#family-payment-claims"
        >
          Track submitted payments
        </a>
      </div>
      <Feedback error={query.error} />
      {query.isLoading && <p>Loading payment options…</p>}
      {dues && (
        <>
          <p>
            {dues.student.name} · Admission {dues.student.admissionNo} ·
            Outstanding {money(dues.outstanding)}
          </p>
          {dues.invoices.length === 0 && (
            <p className="rounded-lg bg-mint p-3">
              No outstanding invoices for this child.
            </p>
          )}
          {query.data?.qr && dues.invoices.length > 0 && !payQr && (
            <form
              className={card}
              onSubmit={(e) => {
                e.preventDefault();
                setPayQr(query.data.qr);
                requestKey.current = crypto.randomUUID();
                write.reset();
              }}
            >
              <p>
                Use a separate transfer for each student. For an existing
                transfer covering siblings, contact the finance office.
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">Choose invoice amounts</h4>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    setAmounts(
                      Object.fromEntries(
                        dues.invoices.map((i) => [i.id, String(i.outstanding)]),
                      ),
                    )
                  }
                >
                  Fill full balance
                </button>
              </div>
              {dues.invoices.map((i) => (
                <label key={i.id} className="block">
                  {i.number} {i.period} · Due {money(i.outstanding)}
                  <input
                    className={field}
                    type="number"
                    min="0"
                    max={i.outstanding}
                    step=".01"
                    placeholder="Amount to pay"
                    value={amounts[i.id] ?? ""}
                    onChange={(e) =>
                      setAmounts({ ...amounts, [i.id]: e.target.value })
                    }
                  />
                </label>
              ))}
              <button className={button} disabled={!total}>
                Show QR for {money(total)}
              </button>
            </form>
          )}
          {!query.data?.qr && !payQr && (
            <p>The school is not currently accepting new QR payments.</p>
          )}
        </>
      )}
      {payQr && (
        <form
          className={card}
          onSubmit={(e) => {
            const data = formData(e);
            if (!data.has("reference") && !data.has("image")) {
              e.currentTarget
                .querySelector<HTMLInputElement>('[name="reference"]')
                ?.focus();
              setEvidenceError(true);
              return;
            }
            setEvidenceError(false);
            data.set("qrId", payQr.id);
            data.set("requestKey", requestKey.current);
            data.set("allocations", JSON.stringify(allocations));
            write.mutate(
              { path: base + "/claims", body: data },
              {
                onSuccess: () => {
                  setPayQr(null);
                  setAmounts({});
                },
              },
            );
          }}
        >
          <p>
            Pay {money(total)} for {dues?.student.name}. Confirm the recipient
            in your payment app is <strong>{payQr.merchant}</strong>.
          </p>
          <PrivateImage
            key={payQr.id}
            path={base + "/code/" + payQr.id}
            alt="School Fonepay payment QR"
          />
          <label>
            Actual amount transferred (NPR)
            <input
              type="number"
              name="amount"
              required
              min=".01"
              max="10000000"
              step=".01"
              defaultValue={total}
              className={field}
            />
          </label>
          <label>
            Transfer date (AD)
            <input
              required
              name="transferredOn"
              className={field}
              type="date"
            />
          </label>
          <EvidenceFields />
          {evidenceError && (
            <p role="alert">Enter a reference or attach a screenshot.</p>
          )}
          <div className="flex gap-2">
            <button className={button} disabled={write.isPending}>
              Submit payment proof
            </button>
            <button
              type="button"
              className={button}
              disabled={write.isPending}
              onClick={() => setPayQr(null)}
            >
              Back
            </button>
          </div>
        </form>
      )}
      <Feedback error={write.error} />
      {write.isSuccess && (
        <p role="status">Proof submitted. Awaiting verification.</p>
      )}
      <div id="family-payment-claims" className="scroll-mt-4">
        <Claims base={base} review={false} />
      </div>
    </section>
  );
}

function Configure() {
  const base = "/fees/qr";
  const config = useQuery({
    queryKey: ["qr", "configuration"],
    queryFn: () => api().get<Qr | null>(base + "/configuration"),
  });
  const write = useWrite();
  const [file, setFile] = useState<File | null>(null);
  const preview = useImageUrl(file);
  return (
    <section className={card}>
      <h2 className="text-xl font-semibold">School collection QR</h2>
      <Feedback error={config.error} />
      {config.data && (
        <details>
          <summary>Active QR · {config.data.merchant}</summary>
          <PrivateImage
            path={base + "/configuration/" + config.data.id + "/image"}
            alt="Active school QR"
          />
          <button
            className={button}
            disabled={write.isPending}
            onClick={() => write.mutate({ path: base + "/disable", body: {} })}
          >
            Disable collections
          </button>
        </details>
      )}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          const form = e.currentTarget;
          const data = formData(e);
          write.mutate(
            { path: base + "/configuration", body: data },
            {
              onSuccess: () => {
                form.reset();
                setFile(null);
              },
            },
          );
        }}
      >
        <label>
          Registered Fonepay merchant name
          <input className={field} required maxLength={100} name="merchant" />
        </label>
        <FileField required onSelect={setFile} />
        {preview && (
          <Image
            unoptimized
            width={500}
            height={500}
            src={preview}
            className="max-h-64 w-auto object-contain"
            alt="Preview of proposed school QR"
          />
        )}
        <label className="block">
          <input type="checkbox" required /> I scanned this code and verified
          the school merchant name.
        </label>
        <button className={button} disabled={write.isPending}>
          Publish QR
        </button>
      </form>
      <Feedback error={write.error} />
      {write.isSuccess && <p role="status">School QR configuration updated.</p>}
    </section>
  );
}
function ClaimCard({
  c,
  base,
  review,
}: {
  c: Claim;
  base: string;
  review: boolean;
}) {
  const path = base + "/claims/" + c.id;
  const write = useWrite();
  const [action, setAction] = useState("APPROVED");
  const [override, setOverride] = useState(false);
  const dues = useQuery({
    queryKey: ["qr", "review-dues", c.id],
    enabled: review && override,
    queryFn: () => api().get<{ students: Options["dues"][] }>(path + "/dues"),
  });
  return (
    <article className={card}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{name(c.student)}</h3>
          <p className="text-sm text-muted">
            Admission {c.student.admissionNo} · Claim QR-
            {String(c.trackingNumber).padStart(6, "0")}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="font-semibold tabular-nums">{money(c.amount)}</p>
          <span
            className={
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
              (c.status === "APPROVED"
                ? "bg-emerald-50 text-emerald-800"
                : c.status === "REJECTED"
                  ? "bg-red-50 text-red-800"
                  : "bg-amber-50 text-amber-900")
            }
          >
            {statusNames[c.status]}
          </span>
        </div>
      </header>
      <dl className="grid gap-3 rounded-lg bg-background p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Submitted by</dt>
          <dd>{name(c.guardian)}</dd>
        </div>
        <div>
          <dt className="text-muted">Transfer date</dt>
          <dd>{c.transferredOn.slice(0, 10)}</dd>
        </div>
        <div>
          <dt className="text-muted">School merchant</dt>
          <dd>{c.qr.merchant}</dd>
        </div>
      </dl>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Requested invoice payments</caption>
        <thead className="text-muted">
          <tr>
            <th>Invoice</th>
            <th className="text-right">Requested</th>
            <th className="text-right">Currently due</th>
          </tr>
        </thead>
        <tbody>
          {c.allocations.map((a) => (
            <tr key={a.invoice.number} className="border-t border-line">
              <td className="py-2">{a.invoice.number}</td>
              <td className="text-right tabular-nums">{money(a.amount)}</td>
              <td className="text-right tabular-nums">
                {money(a.outstanding)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {c.payment && (
        <div>
          <p>
            <strong>Receipt {c.payment.receiptNo}</strong>
            {c.payment.reversal && " · Reversed"}
          </p>
          <p>
            Posted {c.payment.paidOn.slice(0, 10)}
            {c.payment.payerName && " from " + c.payment.payerName}
          </p>
          {c.payment.allocations.map((a) => (
            <p key={a.invoice.number}>
              {a.invoice.number} ({a.invoice.student.admissionNo}) applied{" "}
              {money(a.amount)}
            </p>
          ))}
        </div>
      )}
      {c.events.map((ev) => (
        <div key={ev.id}>
          <span>
            {statusNames[ev.status]} {ev.reference && " · " + ev.reference}{" "}
            {ev.note && " · " + ev.note}
          </span>
          {ev.hasImage && <EvidenceImage path={path + "/evidence/" + ev.id} />}
        </div>
      ))}
      {review && c.status === "PENDING" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            const data = formData(e);
            const body: Record<string, unknown> = Object.fromEntries(data);
            body.status = action;
            if (action === "APPROVED") {
              body.verifiedAmount = Number(data.get("verifiedAmount"));
              if (override) {
                body.allocations = [...data]
                  .filter(
                    ([key, value]) =>
                      key.startsWith("invoice-") && Number(value) > 0,
                  )
                  .map(([key, value]) => ({
                    invoiceId: key.slice(8),
                    amount: Number(value),
                  }));
                for (const key of Object.keys(body))
                  if (key.startsWith("invoice-")) delete body[key];
              }
            }
            write.mutate({ path: path + "/decision", body });
          }}
        >
          <label>
            Decision
            <select
              className={field}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="APPROVED">Approve</option>
              <option value="CLARIFICATION">Request clarification</option>
              <option value="REJECTED">Reject</option>
            </select>
          </label>
          {action === "APPROVED" && (
            <>
              <label>
                Settled merchant transaction reference
                <input
                  required
                  className={field}
                  name="reference"
                  maxLength={60}
                />
              </label>
              <label>
                Bank sender name (if available)
                <input className={field} name="sender" maxLength={100} />
              </label>
              <label>
                Amount on merchant statement (NPR)
                <input
                  className={field}
                  required
                  name="verifiedAmount"
                  type="number"
                  min=".01"
                  step=".01"
                />
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                />{" "}
                Revise allocation for changed dues or a confirmed sibling split
              </label>
              {override && (
                <div>
                  <Feedback error={dues.error} />
                  {dues.data?.students.map((s) => (
                    <fieldset key={s.student.admissionNo}>
                      <legend>
                        {s.student.name} ? {s.student.admissionNo}
                      </legend>
                      {s.invoices.map((i) => (
                        <label key={i.id}>
                          {i.number} ? Due {money(i.outstanding)}
                          <input
                            name={"invoice-" + i.id}
                            type="number"
                            step=".01"
                            min="0"
                            max={i.outstanding}
                            className={field}
                          />
                        </label>
                      ))}
                    </fieldset>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      name="creditStudentId"
                      value={c.student.id}
                    />{" "}
                    Hold any remaining amount as advance credit for{" "}
                    {name(c.student)}
                  </label>
                </div>
              )}
              {!override && (
                <details>
                  <summary>Link an existing matching QR receipt</summary>
                  <label>
                    Receipt number
                    <input
                      className={field}
                      name="existingReceiptNo"
                      placeholder="Enter the printed receipt number"
                    />
                  </label>
                </details>
              )}
              <label className="block">
                <input type="checkbox" required /> I matched the settled
                incoming {money(c.amount)} to this merchant and student.
              </label>
            </>
          )}
          <label>
            Message to family
            <input
              name="note"
              className={field}
              required={action !== "APPROVED" || override}
              maxLength={300}
            />
          </label>
          <button className={button} disabled={write.isPending}>
            {action === "APPROVED" ? "Approve payment" : "Send decision"}
          </button>
        </form>
      )}
      {!review && c.status === "CLARIFICATION" && (
        <form
          onSubmit={(e) => {
            const data = formData(e);
            write.mutate({ path: path + "/evidence", body: data });
          }}
        >
          <EvidenceFields />
          <button className={button} disabled={write.isPending}>
            Send additional proof
          </button>
        </form>
      )}
      <Feedback error={write.error} />
    </article>
  );
}
function EvidenceImage({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className={button} onClick={() => setOpen(!open)}>
        {open ? "Hide" : "View"} screenshot
      </button>
      {open && <PrivateImage path={path} alt="Submitted transfer evidence" />}
    </div>
  );
}
function Claims({ base, review }: { base: string; review: boolean }) {
  const [page, setPage] = useState(1);
  const [day, setDay] = useState("");
  const [status, setStatus] = useState(review ? "PENDING" : "");
  const query = useQuery({
    queryKey: ["qr", "claims", base, status, day, page],
    queryFn: () =>
      api().getPaginated<Claim>(
        base +
          "/claims?page=" +
          page +
          (status ? "&status=" + status : "") +
          (day ? "&transferredOn=" + day : ""),
      ),
    refetchInterval: 60000,
  });
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">
        {review ? "Review transfers" : "My submissions"}
      </h2>
      <label>
        Status
        <select
          className={field}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          {Object.entries(statusNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <Feedback error={query.error} />
      {review && (
        <label>
          Transfer date (AD)
          <input
            type="date"
            className={field}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setPage(1);
            }}
          />
        </label>
      )}
      {query.isPending && <p>Loading submissions…</p>}
      {query.data?.items.length === 0 && <p>No matching submissions.</p>}
      {query.data?.items.map((c) => (
        <ClaimCard key={c.id} c={c} base={base} review={review} />
      ))}
      {query.data && (page > 1 || page < query.data.meta.totalPages) && (
        <div className="flex gap-2">
          <button
            className={button}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            className={button}
            disabled={page >= query.data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
export function FinanceQr({ permissions }: { permissions: string[] }) {
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link
          href="/dashboard/finance"
          className="text-sm text-muted hover:underline"
        >
          Finance overview
        </Link>
        <h1 className="mt-1 text-3xl font-semibold">QR payments</h1>
      </header>

      {permissions.includes("fees:qr-review") && (
        <>
          <Claims base="/fees/qr" review />
          <Reconciliation />
        </>
      )}
      {permissions.includes("fees:qr-manage") && <Configure />}
    </main>
  );
}

function Reconciliation() {
  type Result = {
    reference: string;
    amount: number;
    status: string;
    receiptNo?: string;
    postedAmount?: number;
  };
  const match = useMutation({
    mutationFn: (input: string) => {
      const lines = input
        .trim()
        .split(/\r?\n/)
        .map((row) => {
          const [reference, amount, ...extra] = row.split(",");
          if (
            !reference?.trim() ||
            !amount?.trim() ||
            extra.length ||
            !(Number(amount) > 0)
          )
            throw new Error("Enter one reference and amount per line");
          return { reference: reference.trim(), amount: Number(amount) };
        });
      return api().post<Result[]>("/fees/qr/reconcile", { lines });
    },
  });
  return (
    <section className={card}>
      <h2 className="text-xl font-semibold">Reconcile a merchant statement</h2>
      <form
        onSubmit={(e) => {
          const data = formData(e);
          match.mutate(String(data.get("lines")));
        }}
      >
        <label>
          Paste the day’s settled transfers, one reference and NPR amount per
          line (up to 500)
          <textarea
            className={field}
            name="lines"
            required
            placeholder="TXN-001,3000.00"
          />
        </label>
        <button className={button} disabled={match.isPending}>
          Compare with receipts
        </button>
      </form>
      <Feedback error={match.error} />
      {match.data?.map((r) => (
        <p key={r.reference}>
          {r.reference} · {money(r.amount)} · {r.status}{" "}
          {r.receiptNo &&
            " · " + r.receiptNo + " · posted " + money(r.postedAmount ?? 0)}
        </p>
      ))}
    </section>
  );
}
