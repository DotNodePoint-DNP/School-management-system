"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createFiscalYear,
  currentFiscalYear,
  listFiscalYears,
  closeFiscalYear,
  getFiscalYear,
  updateFiscalYear,
  type FiscalYear,
  type YearInput,
} from "./services/setup";
import {
  Field,
  Failure,
  buttonClass,
  inputClass,
  panelClass,
  primaryClass,
} from "@/components/ui/WorkspaceFields";

function YearEditor({ year, done }: { year?: FiscalYear; done: () => void }) {
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: (input: YearInput) =>
      year
        ? updateFiscalYear(year.id, {
            label: input.label,
            startDate:
              input.startDate !== year.startDate ? input.startDate : undefined,
            endDate: input.endDate !== year.endDate ? input.endDate : undefined,
          })
        : createFiscalYear(input),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["finance", "years"] });
      toast.success("Fiscal year saved.");
      done();
    },
  });
  return (
    <form
      className={panelClass}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        save.mutate({
          label: String(form.get("label")).trim(),
          startDate: String(form.get("start")),
          endDate: String(form.get("end")),
        });
      }}
    >
      <fieldset disabled={save.isPending} className="space-y-4">
        <legend className="mb-3 text-lg font-semibold">
          {year ? "Edit fiscal year" : "New fiscal year"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Year label">
            <input
              name="label"
              required
              minLength={3}
              maxLength={20}
              defaultValue={year?.label}
              className={inputClass}
            />
          </Field>
          <Field label="Start date (AD)">
            <input
              name="start"
              type="date"
              required
              defaultValue={year?.startDate}
              className={inputClass}
            />
          </Field>
          <Field label="End date (AD)">
            <input
              name="end"
              type="date"
              required
              defaultValue={year?.endDate}
              className={inputClass}
            />
          </Field>
        </div>
        <Failure error={save.error} />
        <div className="flex gap-2">
          <button className={primaryClass}>Save year</button>
          <button type="button" className={buttonClass} onClick={done}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export default function FiscalYearsWorkspace({
  permissions,
}: {
  permissions: string[];
}) {
  const canRead = permissions.includes("fees:read");
  const canManage = permissions.includes("fees:fiscal-manage");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const cache = useQueryClient();
  const years = useQuery({
    queryKey: ["finance", "years", "list"],
    queryFn: listFiscalYears,
    enabled: canRead,
  });
  const current = useQuery({
    queryKey: ["finance", "years", "current"],
    queryFn: currentFiscalYear,
    enabled: canRead,
  });
  const detail = useQuery({
    queryKey: ["finance", "years", "detail", selected],
    queryFn: () => getFiscalYear(selected!),
    enabled: canRead && !!selected,
  });
  const close = useMutation({
    mutationFn: closeFiscalYear,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["finance", "years"] });
      toast.success("Fiscal year closed.");
    },
  });
  return (
    <section className="mx-auto max-w-5xl space-y-5 text-ink">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Fiscal years</h1>
          <p className="mt-2 text-muted">
            Set the accounting dates for invoices and receipts.
          </p>
        </div>
        {canManage && !editing && (
          <button
            className={primaryClass}
            onClick={() => {
              setSelected(null);
              setEditing(true);
            }}
          >
            Add fiscal year
          </button>
        )}
      </header>
      {canRead && (
        <div className="rounded-xl border border-line bg-mint p-5">
          <h2 className="font-semibold">Current fiscal year</h2>
          <Failure error={current.error} retry={() => void current.refetch()} />
          {current.isSuccess && (
            <p>
              {current.data
                ? current.data.label + " · " + current.data.status.toLowerCase()
                : "No fiscal year covers today."}
            </p>
          )}
          {current.isPending && <p>Loading…</p>}
        </div>
      )}
      {editing && (!selected || detail.data) && (
        <YearEditor
          year={selected ? detail.data : undefined}
          done={() => setEditing(false)}
        />
      )}
      {canRead && (
        <div className={panelClass}>
          <h2 className="mb-3 text-lg font-semibold">Year register</h2>
          <Failure error={years.error} retry={() => void years.refetch()} />
          {years.isPending && <p>Loading years…</p>}
          {years.data?.length === 0 && (
            <p>No fiscal years have been created.</p>
          )}
          <ul className="divide-y divide-line">
            {years.data?.map((year) => (
              <li key={year.id}>
                <button
                  className="flex min-h-14 w-full flex-wrap items-center justify-between gap-2 py-3 text-left hover:text-teal"
                  disabled={editing}
                  onClick={() => setSelected(year.id)}
                >
                  <strong>{year.label}</strong>
                  <span className="text-sm">
                    {year.startDate} – {year.endDate} ·{" "}
                    {year.status.toLowerCase()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {selected && !editing && (
        <article className={panelClass}>
          <Failure error={detail.error} retry={() => void detail.refetch()} />
          {detail.isPending && <p>Loading year…</p>}
          {detail.data && (
            <>
              <h2 className="text-xl font-semibold">{detail.data.label}</h2>
              <p className="my-3">
                {detail.data.startDate} – {detail.data.endDate} AD
              </p>
              {detail.data.startDateBs && (
                <p>
                  {detail.data.startDateBs} – {detail.data.endDateBs} BS
                </p>
              )}
              {canManage && detail.data.status === "OPEN" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className={buttonClass}
                    disabled={close.isPending}
                    onClick={() => setEditing(true)}
                  >
                    Edit year
                  </button>
                  <button
                    className={buttonClass}
                    disabled={close.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Close fiscal year " +
                            detail.data.label +
                            "? This prevents further changes to the year.",
                        )
                      )
                        close.mutate(detail.data.id);
                    }}
                  >
                    Close fiscal year
                  </button>
                </div>
              )}
              <Failure error={close.error} />
            </>
          )}
        </article>
      )}
    </section>
  );
}
