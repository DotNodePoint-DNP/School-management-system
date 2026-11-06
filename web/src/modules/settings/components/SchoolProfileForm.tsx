"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import {
  getSchoolProfile,
  getSchoolAsset,
  removeSchoolAsset,
  updateSchoolProfile,
  uploadSchoolAsset,
  type SchoolAssetKind,
  type SchoolIdentifier,
  type SchoolPhone,
  type SchoolProfile,
  type UpdateSchoolProfileInput,
} from "@/modules/settings/services/school-profile";

const profileQueryKey = ["school", "profile"];

interface SchoolProfileDraft {
  nameEn: string;
  nameNp: string;
  shortName: string;
  taglineEn: string;
  taglineNp: string;
  schoolType: string;
  establishedOn: string;
  province: string;
  district: string;
  localLevel: string;
  wardNo: string;
  tole: string;
  postalCode: string;
  addressLineNp: string;
  phones: SchoolPhone[];
  email: string;
  website: string;
  identifiers: SchoolIdentifier[];
  documentLanguage: SchoolProfile["documentLanguage"];
  nepaliDigits: boolean;
  admissionNoPrefix: string;
  staffNoPrefix: string;
}

function draftFromProfile(profile: SchoolProfile): SchoolProfileDraft {
  return {
    nameEn: profile.nameEn,
    nameNp: profile.nameNp ?? "",
    shortName: profile.shortName ?? "",
    taglineEn: profile.taglineEn ?? "",
    taglineNp: profile.taglineNp ?? "",
    schoolType: profile.schoolType ?? "",
    establishedOn: profile.establishedOn ?? "",
    province: profile.province ?? "",
    district: profile.district ?? "",
    localLevel: profile.localLevel ?? "",
    wardNo: profile.wardNo?.toString() ?? "",
    tole: profile.tole ?? "",
    postalCode: profile.postalCode ?? "",
    addressLineNp: profile.addressLineNp ?? "",
    phones: profile.phones.map((phone) => ({ ...phone })),
    email: profile.email ?? "",
    website: profile.website ?? "",
    identifiers: profile.identifiers.map((identifier) => ({ ...identifier })),
    documentLanguage: profile.documentLanguage,
    nepaliDigits: profile.nepaliDigits,
    admissionNoPrefix: profile.admissionNoPrefix,
    staffNoPrefix: profile.staffNoPrefix,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403) {
      return "You do not have permission to change the school profile.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "The request failed.";
}

const inputClass =
  "mt-1.5 block w-full rounded-md border border-line bg-panel px-3.5 py-2 text-sm text-ink placeholder:text-muted/60 transition-colors focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal disabled:cursor-not-allowed disabled:opacity-60";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-medium text-ink ${className}`}>
      {label}
      {children}
    </label>
  );
}

function buildUpdateInput(draft: SchoolProfileDraft): UpdateSchoolProfileInput {
  return {
    nameEn: draft.nameEn.trim(),
    nameNp: draft.nameNp.trim() || null,
    shortName: draft.shortName.trim() || null,
    taglineEn: draft.taglineEn.trim() || null,
    taglineNp: draft.taglineNp.trim() || null,
    schoolType: draft.schoolType.trim() || null,
    establishedOn: draft.establishedOn || null,
    province: draft.province.trim() || null,
    district: draft.district.trim() || null,
    localLevel: draft.localLevel.trim() || null,
    wardNo: draft.wardNo ? Number(draft.wardNo) : null,
    tole: draft.tole.trim() || null,
    postalCode: draft.postalCode.trim() || null,
    addressLineNp: draft.addressLineNp.trim() || null,
    phones: draft.phones,
    email: draft.email.trim() || null,
    website: draft.website.trim() || null,
    identifiers: draft.identifiers,
    documentLanguage: draft.documentLanguage,
    nepaliDigits: draft.nepaliDigits,
    admissionNoPrefix: draft.admissionNoPrefix.trim(),
    staffNoPrefix: draft.staffNoPrefix.trim(),
  };
}

export default function SchoolProfileForm({
  canManage,
}: {
  canManage: boolean;
}) {
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: getSchoolProfile,
  });
  if (profileQuery.isPending) {
    return (
      <p className="rounded-xl border border-line bg-panel p-6 text-sm text-muted" role="status">
        Loading school profile…
      </p>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="rounded-xl border border-coral bg-panel p-6 text-sm text-coral" role="alert">
        <p>
          {profileQuery.isError
            ? errorMessage(profileQuery.error)
            : "School profile data is unavailable."}
        </p>
        <button
          className="mt-3 font-semibold text-navy underline dark:text-teal"
          onClick={() => void profileQuery.refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <SchoolProfileEditor
      canManage={canManage}
      profile={profileQuery.data}
    />
  );
}

function SchoolProfileEditor({
  canManage,
  profile,
}: {
  canManage: boolean;
  profile: SchoolProfile;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => draftFromProfile(profile));
  const saveMutation = useMutation({
    mutationFn: updateSchoolProfile,
    onSuccess: async (updatedProfile) => {
      queryClient.setQueryData(profileQueryKey, updatedProfile);
      setDraft(draftFromProfile(updatedProfile));
      toast.success("School profile saved.");
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
  const uploadMutation = useMutation({
    mutationFn: ({ kind, file }: { kind: SchoolAssetKind; file: File }) =>
      uploadSchoolAsset(kind, file),
    onSuccess: async (updatedProfile, variables) => {
      queryClient.setQueryData(profileQueryKey, updatedProfile);
      toast.success(
        `${variables.kind === "logo" ? "Logo" : "Seal"} uploaded.`,
      );
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
  const removeMutation = useMutation({
    mutationFn: removeSchoolAsset,
    onSuccess: async (updatedProfile, kind) => {
      queryClient.setQueryData(profileQueryKey, updatedProfile);
      toast.success(`${kind === "logo" ? "Logo" : "Seal"} removed.`);
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });

  const pending =
    saveMutation.isPending ||
    uploadMutation.isPending ||
    removeMutation.isPending;
  const requestError =
    saveMutation.error ?? uploadMutation.error ?? removeMutation.error;

  function setValue<K extends keyof SchoolProfileDraft>(
    key: K,
    value: SchoolProfileDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePhone(index: number, patch: Partial<SchoolPhone>) {
    setDraft((current) => ({
      ...current,
      phones: current.phones.map((phone, phoneIndex) =>
        phoneIndex === index ? { ...phone, ...patch } : phone,
      ),
    }));
  }

  function updateIdentifier(
    index: number,
    patch: Partial<SchoolIdentifier>,
  ) {
    setDraft((current) => ({
      ...current,
      identifiers: current.identifiers.map((identifier, itemIndex) =>
        itemIndex === index ? { ...identifier, ...patch } : identifier,
      ),
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending) return;
    saveMutation.mutate(buildUpdateInput(draft));
  }

  function uploadAsset(kind: SchoolAssetKind, file: File) {
    if (!canManage || pending) return;
    uploadMutation.mutate({ kind, file });
  }

  function deleteAsset(kind: SchoolAssetKind) {
    if (!canManage || pending) return;
    const label = kind === "logo" ? "logo" : "seal";
    if (window.confirm(`Remove the school's ${label}?`)) {
      removeMutation.mutate(kind);
    }
  }

  return (
    <form
      className="space-y-8 rounded-xl border border-line bg-panel p-5 shadow-sm md:p-8"
      onSubmit={submit}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">
            School profile
          </h2>
          <p className="mt-1 text-sm text-muted">
            Update the school details used on documents and communications.
          </p>
        </div>
        <span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-navy dark:text-foreground">
          Profile version {profile.version}
        </span>
      </header>

      {!canManage && (
        <p className="rounded-md border border-amber/60 bg-background p-3 text-sm text-ink">
          You can view this profile, but need the school management permission
          to make changes.
        </p>
      )}

      <section className="space-y-4">
        <h3 className="border-b border-line pb-2 text-xs font-bold uppercase tracking-wider text-navy dark:text-teal">
          School identity
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="School name (English) *">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={120}
              minLength={2}
              onChange={(event) => setValue("nameEn", event.target.value)}
              required
              value={draft.nameEn}
            />
          </Field>
          <Field label="School name (Nepali)">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={120}
              onChange={(event) => setValue("nameNp", event.target.value)}
              value={draft.nameNp}
            />
          </Field>
          <Field label="Short name">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={40}
              onChange={(event) => setValue("shortName", event.target.value)}
              value={draft.shortName}
            />
          </Field>
          <Field label="School type">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={60}
              onChange={(event) => setValue("schoolType", event.target.value)}
              placeholder="Community, Institutional, etc."
              value={draft.schoolType}
            />
          </Field>
          <Field label="Tagline (English)">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={160}
              onChange={(event) => setValue("taglineEn", event.target.value)}
              value={draft.taglineEn}
            />
          </Field>
          <Field label="Tagline (Nepali)">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={160}
              onChange={(event) => setValue("taglineNp", event.target.value)}
              value={draft.taglineNp}
            />
          </Field>
          <Field label="Established date (AD)">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) =>
                setValue("establishedOn", event.target.value)
              }
              type="date"
              value={draft.establishedOn}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="border-b border-line pb-2 text-xs font-bold uppercase tracking-wider text-navy dark:text-teal">
          Location and contact
        </h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Province">
            <input className={inputClass} disabled={!canManage || pending} maxLength={60} onChange={(event) => setValue("province", event.target.value)} value={draft.province} />
          </Field>
          <Field label="District">
            <input className={inputClass} disabled={!canManage || pending} maxLength={60} onChange={(event) => setValue("district", event.target.value)} value={draft.district} />
          </Field>
          <Field label="Local level / municipality">
            <input className={inputClass} disabled={!canManage || pending} maxLength={80} onChange={(event) => setValue("localLevel", event.target.value)} value={draft.localLevel} />
          </Field>
          <Field label="Ward number">
            <input className={inputClass} disabled={!canManage || pending} max={99} min={1} onChange={(event) => setValue("wardNo", event.target.value)} type="number" value={draft.wardNo} />
          </Field>
          <Field label="Tole">
            <input className={inputClass} disabled={!canManage || pending} maxLength={120} onChange={(event) => setValue("tole", event.target.value)} value={draft.tole} />
          </Field>
          <Field label="Postal code">
            <input className={inputClass} disabled={!canManage || pending} maxLength={10} onChange={(event) => setValue("postalCode", event.target.value)} value={draft.postalCode} />
          </Field>
          <Field label="Address line (Nepali)" className="md:col-span-2 lg:col-span-3">
            <input className={inputClass} disabled={!canManage || pending} maxLength={255} onChange={(event) => setValue("addressLineNp", event.target.value)} value={draft.addressLineNp} />
          </Field>
          <Field label="Official email">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={254}
              onChange={(event) => setValue("email", event.target.value)}
              type="email"
              value={draft.email}
            />
          </Field>
          <Field label="Website (HTTPS)">
            <input
              className={inputClass}
              disabled={!canManage || pending}
              maxLength={200}
              onChange={(event) => setValue("website", event.target.value)}
              pattern="https://.+"
              placeholder="https://school.example"
              type="url"
              value={draft.website}
            />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-ink">Phone numbers</h4>
            <button
              className="text-sm font-semibold text-teal underline disabled:opacity-50"
              disabled={!canManage || pending || draft.phones.length >= 5}
              onClick={() =>
                setValue("phones", [
                  ...draft.phones,
                  { label: "", type: "MOBILE", number: "" },
                ])
              }
              type="button"
            >
              Add phone
            </button>
          </div>
          {draft.phones.map((phone, index) => (
            <div className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[1fr_1fr_1fr_auto]" key={index}>
              <input aria-label="Phone label" className={inputClass} disabled={!canManage || pending} maxLength={30} onChange={(event) => updatePhone(index, { label: event.target.value })} placeholder="Label (e.g. Office)" required value={phone.label} />
              <select aria-label="Phone type" className={inputClass} disabled={!canManage || pending} onChange={(event) => updatePhone(index, { type: event.target.value as SchoolPhone["type"] })} value={phone.type}>
                <option value="MOBILE">Mobile</option>
                <option value="LANDLINE">Landline</option>
                <option value="OTHER">Other</option>
              </select>
              <input aria-label="Phone number" className={inputClass} disabled={!canManage || pending} maxLength={25} onChange={(event) => updatePhone(index, { number: event.target.value })} placeholder="Phone number" required value={phone.number} />
              <button className="px-2 text-sm font-semibold text-coral disabled:opacity-50" disabled={!canManage || pending} onClick={() => setValue("phones", draft.phones.filter((_, itemIndex) => itemIndex !== index))} type="button">
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-navy dark:text-teal">
            Document settings
          </h3>
          <button
            className="text-sm font-semibold text-teal underline disabled:opacity-50"
            disabled={!canManage || pending || draft.identifiers.length >= 10}
            onClick={() =>
              setValue("identifiers", [
                ...draft.identifiers,
                { labelEn: "", value: "", showOnDocuments: false },
              ])
            }
            type="button"
          >
            Add identifier
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Document language">
            <select className={inputClass} disabled={!canManage || pending} onChange={(event) => setValue("documentLanguage", event.target.value as SchoolProfile["documentLanguage"])} value={draft.documentLanguage}>
              <option value="EN">English</option>
              <option value="NP">Nepali</option>
              <option value="BOTH">English and Nepali</option>
            </select>
          </Field>
          <Field label="Admission number prefix">
            <input className={inputClass} disabled={!canManage || pending} maxLength={8} minLength={1} onChange={(event) => setValue("admissionNoPrefix", event.target.value.toUpperCase())} pattern="[A-Z0-9]{1,8}" required value={draft.admissionNoPrefix} />
          </Field>
          <Field label="Staff number prefix">
            <input className={inputClass} disabled={!canManage || pending} maxLength={8} minLength={1} onChange={(event) => setValue("staffNoPrefix", event.target.value.toUpperCase())} pattern="[A-Z0-9]{1,8}" required value={draft.staffNoPrefix} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input checked={draft.nepaliDigits} className="accent-teal" disabled={!canManage || pending} onChange={(event) => setValue("nepaliDigits", event.target.checked)} type="checkbox" />
            Use Nepali digits
          </label>
        </div>
        {draft.identifiers.map((identifier, index) => (
          <div className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-4" key={index}>
            <input aria-label="Identifier label in English" className={inputClass} disabled={!canManage || pending} maxLength={60} onChange={(event) => updateIdentifier(index, { labelEn: event.target.value })} placeholder="Label (English)" required value={identifier.labelEn} />
            <input aria-label="Identifier value" className={inputClass} disabled={!canManage || pending} maxLength={60} onChange={(event) => updateIdentifier(index, { value: event.target.value })} placeholder="Value" required value={identifier.value} />
            <input aria-label="Identifier label in Nepali" className={inputClass} disabled={!canManage || pending} maxLength={60} onChange={(event) => updateIdentifier(index, { labelNp: event.target.value })} placeholder="Label (Nepali, optional)" value={identifier.labelNp ?? ""} />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input checked={identifier.showOnDocuments} className="accent-teal" disabled={!canManage || pending} onChange={(event) => updateIdentifier(index, { showOnDocuments: event.target.checked })} type="checkbox" />
                Show on documents
              </label>
              <button className="text-sm font-semibold text-coral" disabled={!canManage || pending} onClick={() => setValue("identifiers", draft.identifiers.filter((_, itemIndex) => itemIndex !== index))} type="button">
                Remove
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h3 className="border-b border-line pb-2 text-xs font-bold uppercase tracking-wider text-navy dark:text-teal">
          School branding
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          {(["logo", "seal"] as const).map((kind) => {
            return (
              <SchoolAssetCard
                canManage={canManage}
                image={profile[kind]}
                isPending={pending}
                key={kind}
                kind={kind}
                onRemove={deleteAsset}
                onUpload={uploadAsset}
              />
            );
          })}
        </div>
      </section>

      {requestError && (
        <p
          className="rounded-md border border-coral p-3 text-sm text-coral"
          role="alert"
        >
          {errorMessage(requestError)}
        </p>
      )}

      {canManage && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-xs text-muted">
            Profile updates are recorded in the school audit history.
          </p>
          <button
            className="rounded-md bg-teal px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50"
            disabled={pending || !draft.nameEn.trim()}
            type="submit"
          >
            {saveMutation.isPending ? "Saving…" : "Save profile"}
          </button>
        </footer>
      )}
    </form>
  );
}

function SchoolAssetCard({
  canManage,
  image,
  isPending,
  kind,
  onRemove,
  onUpload,
}: {
  canManage: boolean;
  image: SchoolProfile["logo"];
  isPending: boolean;
  kind: SchoolAssetKind;
  onRemove: (kind: SchoolAssetKind) => void;
  onUpload: (kind: SchoolAssetKind, file: File) => void;
}) {
  const assetQuery = useQuery({
    queryKey: ["school", "asset", kind, image?.fileId],
    queryFn: () => getSchoolAsset(kind),
    enabled: Boolean(image),
  });
  const [file, setFile] = useState<File | null>(null);
  const label = kind === "logo" ? "Logo" : "Seal";

  return (
    <div className="space-y-3 rounded-md border border-line p-4">
      <div className="flex items-center gap-3">
        {image && assetQuery.data && (
          <Image
            alt={`School ${label.toLowerCase()}`}
            className="h-16 w-16 rounded-md border border-line bg-background object-contain p-1"
            height={64}
            src={assetQuery.data}
            unoptimized
            width={64}
          />
        )}
        <div>
          <h4 className="font-semibold text-ink">School {label}</h4>
          {image ? (
            <p className="mt-1 text-xs text-muted">
              {image.width} × {image.height}px
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              No {label.toLowerCase()} uploaded.
            </p>
          )}
          {assetQuery.isError && (
            <p className="mt-1 text-xs text-coral" role="alert">
              {errorMessage(assetQuery.error)}
            </p>
          )}
        </div>
      </div>
      <input
        accept="image/png,image/jpeg"
        className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-background file:px-3 file:py-1.5 file:font-medium file:text-ink hover:file:border-teal"
        disabled={!canManage || isPending}
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        type="file"
      />
      <div className="flex gap-3">
        <button
          className="rounded-md bg-teal px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy disabled:opacity-50"
          disabled={!canManage || isPending || !file}
          onClick={() => file && onUpload(kind, file)}
          type="button"
        >
          Upload {label.toLowerCase()}
        </button>
        {image && (
          <button
            className="rounded-md border border-coral px-3 py-2 text-sm font-semibold text-coral hover:bg-coral/10 disabled:opacity-50"
            disabled={!canManage || isPending}
            onClick={() => onRemove(kind)}
            type="button"
          >
            Remove
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        PNG or JPEG up to 1 MB; minimum 64 pixels on the shorter side.
      </p>
    </div>
  );
}
