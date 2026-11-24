"use client";

import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createFeeHead,
  updateFeeHead,
  deleteFeeHead,
  listFeeHeads,
  frequencies,
  type Frequency,
  type FeeHead,
} from "./services/setup";
import {
  Field,
  Failure,
  inputClass,
  buttonClass,
  primaryClass,
  panelClass,
} from "@/components/ui/WorkspaceFields";

function FeeHeadEditor({ head, done }: { head?: FeeHead; done: () => void }) {
  const cache = useQueryClient();
  const [frequency, setFrequency] = useState<Frequency>(
    head?.frequency ?? "MONTHLY",
  );
  const save = useMutation({
    mutationFn: (form: FormData) => {
      const input = {
        name: String(form.get("name")).trim(),
        nameNp: String(form.get("nameNp")).trim(),
        incomeAccountCode: String(form.get("incomeAccountCode")).trim(),
        frequency,
        sortOrder: Number(form.get("sortOrder")),
        perStudent: form.has("perStudent"),
      };
      return head
        ? updateFeeHead(head.id, { ...input, isActive: form.has("isActive") })
        : createFeeHead({
            ...input,
            code: String(form.get("code")).trim().toUpperCase(),
          });
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["finance", "heads"] });
      toast.success("Fee head saved.");
      done();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(new FormData(event.currentTarget));
  }
  return (
    <form onSubmit={submit} className={panelClass}>
      <fieldset disabled={save.isPending} className="space-y-4">
        <legend className="mb-3 text-lg font-semibold">
          {head ? "Edit " + head.code : "New fee head"}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code">
            <input
              className={inputClass}
              name="code"
              required
              disabled={!!head}
              defaultValue={head?.code}
              pattern="[a-zA-Z0-9_]{2,20}"
              title="2–20 letters, digits or underscores"
            />
          </Field>
          <Field label="Name">
            <input
              className={inputClass}
              name="name"
              required
              minLength={2}
              maxLength={80}
              defaultValue={head?.name}
            />
          </Field>
          <Field label="Nepali name (optional)">
            <input
              className={inputClass}
              name="nameNp"
              maxLength={80}
              defaultValue={head?.nameNp ?? ""}
            />
          </Field>
          <Field label="Frequency">
            <select
              className={inputClass}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
            >
              {Object.entries(frequencies).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Income account (optional)">
            <input
              className={inputClass}
              name="incomeAccountCode"
              maxLength={30}
              defaultValue={head?.incomeAccountCode ?? ""}
            />
          </Field>
          <Field label="Display order">
            <input
              className={inputClass}
              type="number"
              min="0"
              max="1000"
              required
              name="sortOrder"
              defaultValue={head?.sortOrder ?? 100}
            />
          </Field>
        </div>
        {frequency !== "AD_HOC" && (
          <label className="block">
            <input
              type="checkbox"
              name="perStudent"
              defaultChecked={head?.perStudent}
            />{" "}
            Assign to individual students
          </label>
        )}
        {head && (
          <label className="block">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={head.isActive}
            />{" "}
            Active
          </label>
        )}
        <Failure error={save.error} />
        <div className="flex flex-wrap gap-2">
          <button className={primaryClass}>Save fee head</button>
          <button className={buttonClass} type="button" onClick={done}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export default function FeeHeadsWorkspace({
  permissions,
}: {
  permissions: string[];
}) {
  const canRead = permissions.includes("fees:read");
  const canManage = permissions.includes("fees:structure-manage");
  const [editor, setEditor] = useState<FeeHead | "new" | null>(null);
  const [filter, setFilter] = useState("all");
  const cache = useQueryClient();
  const heads = useQuery({
    queryKey: ["finance", "heads"],
    queryFn: listFeeHeads,
    enabled: canRead,
  });
  const remove = useMutation({
    mutationFn: deleteFeeHead,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["finance", "heads"] });
      toast.success("Fee head deleted.");
    },
  });
  const rows = heads.data?.filter(
    (h) => filter === "all" || h.isActive === (filter === "active"),
  );
  return (
    <section className="mx-auto w-full max-w-5xl space-y-5 text-ink">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Fee heads</h1>
          <p className="mt-2 text-muted">
            Manage the charges used in school billing.
          </p>
        </div>
        {canManage && !editor && (
          <button className={primaryClass} onClick={() => setEditor("new")}>
            Add fee head
          </button>
        )}
      </header>
      {editor && (
        <FeeHeadEditor
          key={editor === "new" ? "new" : editor.id}
          head={editor === "new" ? undefined : editor}
          done={() => setEditor(null)}
        />
      )}
      {canRead && (
        <div className={panelClass}>
          <div className="mb-4 max-w-52">
            <Field label="Status">
              <select
                className={inputClass}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All fee heads</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>
          <Failure error={heads.error} retry={() => void heads.refetch()} />
          <Failure error={remove.error} />
          {heads.isPending && <p role="status">Loading fee heads…</p>}
          {rows?.length === 0 && <p>No fee heads match this view.</p>}
          <ul className="divide-y divide-line">
            {rows?.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0 break-words">
                  <strong>{h.name}</strong>
                  <p className="text-sm text-muted">
                    {h.code} · {frequencies[h.frequency]} ·{" "}
                    {h.isActive ? "Active" : "Inactive"}
                  </p>
                </div>
                {canManage && !editor && (
                  <div className="flex gap-2">
                    <button
                      className={buttonClass}
                      onClick={() => setEditor(h)}
                    >
                      Edit
                    </button>
                    <button
                      className={buttonClass}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Delete " +
                              h.name +
                              "? Only unused fee heads can be deleted.",
                          )
                        )
                          remove.mutate(h.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
