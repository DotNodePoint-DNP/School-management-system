"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import {
  copyGradeScale,
  createGradeScale,
  deleteGradeScale,
  listGradeScales,
  replaceGradeScale,
  setDefaultGradeScale,
  type GradeBand,
  type GradeBandInput,
  type GradeScale,
} from "@/modules/settings/services/grade-scales";

const queryKey = ["grade-scales"];

interface BandDraft {
  key: string;
  grade: string;
  minPercent: string;
  gradePoint: string;
  description: string;
  isPass: boolean;
}

function draftBands(bands: GradeBand[]): BandDraft[] {
  return bands.map((band, index) => ({
    key: `${band.grade}-${index}`,
    grade: band.grade,
    minPercent: String(band.minPercent),
    gradePoint: String(band.gradePoint),
    description: band.description,
    isPass: band.isPass,
  }));
}

function newBand(key: string, values: Partial<BandDraft> = {}): BandDraft {
  return {
    key,
    grade: values.grade ?? "",
    minPercent: values.minPercent ?? "",
    gradePoint: values.gradePoint ?? "",
    description: values.description ?? "",
    isPass: values.isPass ?? true,
  };
}

function parseBands(bands: BandDraft[]): GradeBandInput[] {
  return bands.map((band) => ({
    grade: band.grade.trim(),
    minPercent: Number(band.minPercent),
    gradePoint: Number(band.gradePoint),
    description: band.description.trim(),
    isPass: band.isPass,
  }));
}

function validateBands(bands: GradeBandInput[]): string | null {
  if (bands.length < 2 || bands.length > 15) {
    return "A scale must contain between 2 and 15 bands.";
  }
  if (bands.some((band) => !band.grade || !band.description)) {
    return "Each band needs a grade and description.";
  }
  if (
    bands.some(
      (band) =>
        band.grade.length > 6 ||
        !Number.isFinite(band.minPercent) ||
        band.minPercent < 0 ||
        band.minPercent > 100 ||
        !Number.isFinite(band.gradePoint) ||
        band.gradePoint < 0 ||
        band.gradePoint > 10 ||
        band.description.length > 40,
    )
  ) {
    return "Check band limits: grade up to 6 characters, threshold 0–100%, grade point 0–10, and description up to 40 characters.";
  }

  const ascending = [...bands].sort((a, b) => a.minPercent - b.minPercent);
  if (ascending[0]?.minPercent !== 0) {
    return "A grade band must start at 0% so every mark is covered.";
  }
  if (new Set(ascending.map((band) => Math.round(band.minPercent * 100))).size !== bands.length) {
    return "Each band must have a unique threshold percentage.";
  }
  if (new Set(ascending.map((band) => band.grade.toLowerCase())).size !== bands.length) {
    return "Each band must have a unique grade.";
  }
  for (let index = 1; index < ascending.length; index += 1) {
    const lower = ascending[index - 1];
    const higher = ascending[index];
    if (!lower || !higher) continue;
    if (higher.gradePoint < lower.gradePoint) {
      return "Grade points cannot decrease as the percentage threshold increases.";
    }
    if (lower.isPass && !higher.isPass) {
      return "A higher percentage band cannot fail when a lower band passes.";
    }
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403) {
      return "You do not have permission to manage grading scales.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "The request failed.";
}

const inputClass =
  "rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:opacity-60";

export default function GradingScaleBuilder({
  canManage = true,
}: {
  canManage?: boolean;
}) {
  const queryClient = useQueryClient();
  const scalesQuery = useQuery({
    queryKey,
    queryFn: listGradeScales,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const createMutation = useMutation({
    mutationFn: createGradeScale,
    onSuccess: async (scale) => {
      await queryClient.invalidateQueries({ queryKey });
      setSelectedId(scale.id);
      setCreating(false);
      toast.success(`Grading scale "${scale.name}" created.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const copyMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      copyGradeScale(id, name),
    onSuccess: async (scale) => {
      await queryClient.invalidateQueries({ queryKey });
      setSelectedId(scale.id);
      setCreating(false);
      toast.success(`Grading scale copied as "${scale.name}".`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const defaultMutation = useMutation({
    mutationFn: setDefaultGradeScale,
    onSuccess: async (scale) => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(`"${scale.name}" is now the default grading scale.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteGradeScale,
    onSuccess: async (_result, id) => {
      await queryClient.invalidateQueries({ queryKey });
      if (selectedId === id) setSelectedId(null);
      toast.success("Grading scale deleted.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const selectedScale =
    scalesQuery.data?.find((scale) => scale.id === selectedId) ??
    scalesQuery.data?.[0] ??
    null;

  function startCreate() {
    setSelectedId(null);
    setCreating(true);
  }

  function copyScale(scale: GradeScale) {
    const name = window.prompt(
      "Name for the copied grading scale:",
      `${scale.name} (Copy)`,
    );
    if (name?.trim()) {
      copyMutation.mutate({ id: scale.id, name: name.trim() });
    }
  }

  function removeScale(scale: GradeScale) {
    if (scale.isDefault || scale.policyCount > 0) return;
    if (window.confirm(`Delete grading scale "${scale.name}"?`)) {
      deleteMutation.mutate(scale.id);
    }
  }

  if (scalesQuery.isPending) {
    return (
      <p className="p-6 text-sm text-muted" role="status">
        Loading grading scales…
      </p>
    );
  }
  if (scalesQuery.isError) {
    return (
      <div className="rounded-lg border border-coral bg-panel p-5 text-sm text-coral" role="alert">
        <p>{errorMessage(scalesQuery.error)}</p>
        <button
          className="mt-2 underline"
          onClick={() => void scalesQuery.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Grading scales
          </h1>
          <p className="mt-1 text-sm text-muted">
            Define grade thresholds, grade points, and pass status.
          </p>
        </div>
        {canManage && (
          <button
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy"
            onClick={startCreate}
            type="button"
          >
            Create grading scale
          </button>
        )}
      </header>

      {!canManage && (
        <p className="rounded-md border border-amber/60 bg-panel p-3 text-sm text-ink">
          You can view grading scales, but need exam management permission to
          make changes.
        </p>
      )}

      {!scalesQuery.data.length && !creating ? (
        <p className="rounded-lg border border-dashed border-line bg-panel p-8 text-center text-sm text-muted">
          No grading scales are configured.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.8fr)_2fr]">
          <aside className="space-y-3">
            <h2 className="text-sm font-semibold text-ink">Available scales</h2>
            <ul className="space-y-2">
              {scalesQuery.data.map((scale) => (
                <li key={scale.id}>
                  <button
                    aria-pressed={!creating && scale.id === selectedScale?.id}
                    className="w-full rounded-md border border-line bg-panel p-3 text-left transition-colors hover:border-teal aria-pressed:border-teal aria-pressed:bg-mint"
                    onClick={() => {
                      setCreating(false);
                      setSelectedId(scale.id);
                    }}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{scale.name}</span>
                      {scale.isDefault && (
                        <span className="rounded bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal">
                          DEFAULT
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {scale.bands.length} bands · used by {scale.policyCount}{" "}
                      {scale.policyCount === 1 ? "policy" : "policies"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="min-w-0">
            {creating ? (
              <GradeScaleEditor
                canManage={canManage}
                isPending={createMutation.isPending}
                onCancel={() => setCreating(false)}
                onSave={(input) => createMutation.mutate(input)}
              />
            ) : selectedScale ? (
              <GradeScaleDetails
                canManage={canManage}
                key={selectedScale.id}
                isPending={
                  defaultMutation.isPending ||
                  deleteMutation.isPending ||
                  copyMutation.isPending
                }
                onCopy={() => copyScale(selectedScale)}
                onDelete={() => removeScale(selectedScale)}
                onSetDefault={() => defaultMutation.mutate(selectedScale.id)}
                onUpdate={(input) =>
                  replaceGradeScale(selectedScale.id, input)
                }
                scale={selectedScale}
              />
            ) : (
              <div className="rounded-md border border-dashed border-line bg-panel p-8 text-center text-sm text-muted">
                Select a grading scale to view and edit it.
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function GradeScaleDetails({
  canManage,
  isPending,
  onCopy,
  onDelete,
  onSetDefault,
  onUpdate,
  scale,
}: {
  canManage: boolean;
  isPending: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  onUpdate: (input: { name: string; bands: GradeBandInput[] }) => Promise<GradeScale>;
  scale: GradeScale;
}) {
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: onUpdate,
    onSuccess: async (updatedScale) => {
      queryClient.setQueryData<GradeScale[]>(queryKey, (scales) =>
        scales?.map((item) =>
          item.id === updatedScale.id ? updatedScale : item,
        ),
      );
      await queryClient.invalidateQueries({ queryKey });
      toast.success(`Grading scale "${updatedScale.name}" saved.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <GradeScaleEditor
      canManage={canManage}
      initialScale={scale}
      isDefault={scale.isDefault}
      isPending={isPending || updateMutation.isPending}
      onCopy={onCopy}
      onDelete={onDelete}
      onSave={(input) => updateMutation.mutate(input)}
      onSetDefault={onSetDefault}
    />
  );
}

function GradeScaleEditor({
  canManage,
  initialScale,
  isDefault = false,
  isPending = false,
  onCancel,
  onCopy,
  onDelete,
  onSave,
  onSetDefault,
}: {
  canManage: boolean;
  initialScale?: GradeScale;
  isDefault?: boolean;
  isPending?: boolean;
  onCancel?: () => void;
  onCopy?: () => void;
  onDelete?: () => void;
  onSave: (input: { name: string; bands: GradeBandInput[] }) => void;
  onSetDefault?: () => void;
}) {
  const [name, setName] = useState(initialScale?.name ?? "");
  const [bands, setBands] = useState<BandDraft[]>(
    initialScale
      ? draftBands(initialScale.bands)
      : [
          newBand("new-top", {
            grade: "A",
            minPercent: "80",
            gradePoint: "4",
            description: "Excellent",
            isPass: true,
          }),
          newBand("new-bottom", {
            grade: "F",
            minPercent: "0",
            gradePoint: "0",
            description: "Needs improvement",
            isPass: false,
          }),
        ],
  );
  const [validationError, setValidationError] = useState("");

  function updateBand(key: string, patch: Partial<BandDraft>) {
    setBands((current) =>
      current.map((band) => (band.key === key ? { ...band, ...patch } : band)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanedName = name.trim();
    if (cleanedName.length < 2 || cleanedName.length > 60) {
      setValidationError("Scale name must be between 2 and 60 characters.");
      return;
    }
    const parsedBands = parseBands(bands);
    const invalid = validateBands(parsedBands);
    if (invalid) {
      setValidationError(invalid);
      return;
    }
    setValidationError("");
    onSave({ name: cleanedName, bands: parsedBands });
  }

  return (
    <form
      className="space-y-5 rounded-lg border border-line bg-panel p-4 md:p-6"
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            {initialScale ? "Edit grading scale" : "Create grading scale"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Each band starts at its minimum percentage and ends below the next
            higher band.
          </p>
        </div>
        {initialScale && (
          <div className="flex flex-wrap gap-2">
            {canManage && !isDefault && (
              <button
                className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:border-teal hover:bg-mint"
                disabled={isPending}
                onClick={onSetDefault}
                type="button"
              >
                Set as default
              </button>
            )}
            {canManage && (
              <button
                className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-navy hover:border-teal hover:bg-mint"
                disabled={isPending}
                onClick={onCopy}
                type="button"
              >
                Copy
              </button>
            )}
            {canManage && !isDefault && initialScale.policyCount === 0 && (
              <button
                className="rounded-md border border-coral px-3 py-1.5 text-xs font-semibold text-coral hover:bg-coral/10"
                disabled={isPending}
                onClick={onDelete}
                type="button"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <label className="block max-w-lg text-sm font-medium text-ink">
        Scale name
        <input
          className={`${inputClass} mt-1 block w-full`}
          disabled={!canManage || isPending}
          maxLength={60}
          minLength={2}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </label>

      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">From %</th>
              <th className="px-3 py-2">Grade point</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Result</th>
              {canManage && <th className="px-3 py-2">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bands.map((band) => (
              <tr key={band.key}>
                <td className="px-3 py-2">
                  <input
                    aria-label="Grade"
                    className={`${inputClass} w-20`}
                    disabled={!canManage || isPending}
                    maxLength={6}
                    onChange={(event) =>
                      updateBand(band.key, { grade: event.target.value })
                    }
                    required
                    value={band.grade}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label="Minimum percentage"
                    className={`${inputClass} w-24`}
                    disabled={!canManage || isPending}
                    max={100}
                    min={0}
                    onChange={(event) =>
                      updateBand(band.key, { minPercent: event.target.value })
                    }
                    required
                    step="0.01"
                    type="number"
                    value={band.minPercent}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label="Grade point"
                    className={`${inputClass} w-24`}
                    disabled={!canManage || isPending}
                    max={10}
                    min={0}
                    onChange={(event) =>
                      updateBand(band.key, { gradePoint: event.target.value })
                    }
                    required
                    step="0.01"
                    type="number"
                    value={band.gradePoint}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    aria-label="Band description"
                    className={`${inputClass} min-w-36`}
                    disabled={!canManage || isPending}
                    maxLength={40}
                    onChange={(event) =>
                      updateBand(band.key, { description: event.target.value })
                    }
                    required
                    value={band.description}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    aria-pressed={band.isPass}
                    className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                      band.isPass
                        ? "border-teal/30 bg-teal/10 text-teal"
                        : "border-coral/30 bg-coral/10 text-coral"
                    }`}
                    disabled={!canManage || isPending}
                    onClick={() =>
                      updateBand(band.key, { isPass: !band.isPass })
                    }
                    type="button"
                  >
                    {band.isPass ? "Pass" : "Fail"}
                  </button>
                </td>
                {canManage && (
                  <td className="px-3 py-2">
                    <button
                      className="text-sm font-semibold text-coral disabled:opacity-40"
                      disabled={isPending || bands.length <= 2}
                      onClick={() =>
                        setBands((current) =>
                          current.filter((item) => item.key !== band.key),
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <button
          className="rounded-md border border-line px-3 py-2 text-sm font-semibold text-teal hover:border-teal hover:bg-mint disabled:opacity-50"
          disabled={isPending || bands.length >= 15}
          onClick={() =>
            setBands((current) => [
              ...current,
              newBand(`band-${crypto.randomUUID()}`, {
                grade: "",
                minPercent: "",
                gradePoint: "",
                description: "",
                isPass: true,
              }),
            ])
          }
          type="button"
        >
          Add grade band
        </button>
      )}

      {validationError && (
        <p className="rounded-md border border-coral p-3 text-sm text-coral" role="alert">
          {validationError}
        </p>
      )}

      <footer className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
        {onCancel && (
          <button
            className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-muted hover:bg-background"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        {canManage && (
          <button
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy disabled:opacity-50"
            disabled={isPending || bands.length < 2}
            type="submit"
          >
            {isPending
              ? "Saving…"
              : initialScale
                ? "Save grading scale"
                : "Create grading scale"}
          </button>
        )}
      </footer>
    </form>
  );
}
