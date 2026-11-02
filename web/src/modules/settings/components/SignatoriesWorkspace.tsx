"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileSignature, ImageUp, ScanEye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listStaff } from "@/modules/staff/services/staff";
import {
  createSignatory,
  getSignatory,
  getLetterheadPreview,
  getStaffSignature,
  listSignatories,
  readSignatorySignature,
  readStaffSignatureImage,
  removeSignatorySignature,
  removeStaffSignature,
  setStaffSignatureMode,
  updateSignatory,
  uploadSignatorySignature,
  uploadStaffSignature,
  type SignatoryRole,
} from "../services/signatories";

const fieldClass = "h-10 w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/15";
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const roles: { value: SignatoryRole; label: string }[] = [
  { value: "PRINCIPAL", label: "Principal" },
  { value: "EXAM_CONTROLLER", label: "Exam controller" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "OTHER", label: "Other" },
];

export default function SignatoriesWorkspace({ permissions }: { permissions: readonly string[] }) {
  const queryClient = useQueryClient();
  const canManage = permissions.includes("school:manage-signatories");
  const canReadStaff = permissions.includes("staff:read");
  const [role, setRole] = useState<SignatoryRole>("PRINCIPAL");
  const [roleLabel, setRoleLabel] = useState("");
  const [fullNameEn, setFullNameEn] = useState("");
  const [fullNameNp, setFullNameNp] = useState("");
  const [designationEn, setDesignationEn] = useState("");
  const [designationNp, setDesignationNp] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [showPreview, setShowPreview] = useState(false);
  const [staffId, setStaffId] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const signatoriesQuery = useQuery({ queryKey: ["school", "signatories"], queryFn: listSignatories, enabled: canManage, retry: false });
  const detailQuery = useQuery({ queryKey: ["school", "signatory", detailId], queryFn: () => getSignatory(detailId!), enabled: Boolean(canManage && detailId), retry: false });
  const staffQuery = useQuery({ queryKey: ["staff", "signature-select"], queryFn: () => listStaff({ page: 1, pageSize: 100, status: "ACTIVE", sortBy: "name", sortOrder: "asc" }), enabled: canManage && canReadStaff, retry: false });
  const staffSignatureQuery = useQuery({ queryKey: ["school", "staff-signature", staffId], queryFn: () => getStaffSignature(staffId), enabled: Boolean(canManage && canReadStaff && staffId), retry: false });
  const previewQuery = useQuery({ queryKey: ["school", "letterhead-preview", asOf], queryFn: () => getLetterheadPreview({ asOf }), enabled: showPreview && canManage, retry: false });
  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["school", "signatories"] }),
    queryClient.invalidateQueries({ queryKey: ["school", "letterhead-preview"] }),
  ]);
  const createMutation = useMutation({
    mutationFn: () => createSignatory({
      role,
      ...(role === "OTHER" ? { roleLabel: roleLabel.trim() } : {}),
      fullNameEn: fullNameEn.trim(),
      ...(fullNameNp.trim() ? { fullNameNp: fullNameNp.trim() } : {}),
      designationEn: designationEn.trim(),
      ...(designationNp.trim() ? { designationNp: designationNp.trim() } : {}),
      validFrom,
      closePrevious: true,
    }),
    onSuccess: async (created) => { setFullNameEn(""); setFullNameNp(""); setDesignationEn(""); setDesignationNp(""); setRoleLabel(""); await refresh(); toast.success(`${created.fullNameEn} was added as a signatory.`); },
    onError: (error) => toast.error(message(error)),
  });
  const modeMutation = useMutation({
    mutationFn: (input: { id: string; mode: "DIGITAL" | "LINE" }) => updateSignatory(input.id, { mode: input.mode }),
    onSuccess: async () => { await refresh(); toast.success("Signature mode updated."); },
    onError: (error) => toast.error(message(error)),
  });
  const uploadMutation = useMutation({
    mutationFn: (input: { id: string; file: File }) => uploadSignatorySignature(input.id, input.file),
    onSuccess: async () => { await refresh(); toast.success("Signature uploaded."); },
    onError: (error) => toast.error(message(error)),
  });
  const removeMutation = useMutation({
    mutationFn: removeSignatorySignature,
    onSuccess: async () => { await refresh(); toast.success("Signature removed; this signatory now uses a signature line."); },
    onError: (error) => toast.error(message(error)),
  });
  const staffUploadMutation = useMutation({
    mutationFn: (file: File) => uploadStaffSignature(staffId, file),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["school", "staff-signature", staffId] }); toast.success("Staff signature uploaded."); },
    onError: (error) => toast.error(message(error)),
  });
  const staffModeMutation = useMutation({
    mutationFn: (mode: "DIGITAL" | "LINE") => setStaffSignatureMode(staffId, mode),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["school", "staff-signature", staffId] }); toast.success("Staff signature mode updated."); },
    onError: (error) => toast.error(message(error)),
  });
  const staffRemoveMutation = useMutation({
    mutationFn: () => removeStaffSignature(staffId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["school", "staff-signature", staffId] }); toast.success("Staff signature removed."); },
    onError: (error) => toast.error(message(error)),
  });

  if (!canManage) return <div className="rounded-xl border border-line bg-panel p-8 text-sm text-muted">Your account does not have permission to manage signatories.</div>;
  const signatories = signatoriesQuery.data ?? [];
  const staff = staffQuery.data?.items ?? [];

  async function downloadSignature(id: string, staffImage = false) {
    try {
      const blob = staffImage
        ? await readStaffSignatureImage(id)
        : await readSignatorySignature(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `signature-${id}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(message(error));
    }
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate();
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="border-b border-line pb-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">School identity</p><h1 className="mt-1 text-2xl font-black tracking-tight text-ink">Signatories & letterhead</h1><p className="mt-1 text-sm text-muted">Configure signatory holders, secure signature images, and inspect the assembled print letterhead.</p></header>
      {signatoriesQuery.isError && <p role="alert" className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm text-coral">{message(signatoriesQuery.error)}</p>}
      <section className="rounded-2xl border border-line bg-panel p-5"><h2 className="font-bold text-ink">Add signatory</h2><form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={submitCreate}><label className="space-y-1 text-xs font-semibold text-muted">Role<select value={role} onChange={(event) => setRole(event.target.value as SignatoryRole)} className={fieldClass}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{role === "OTHER" && <label className="space-y-1 text-xs font-semibold text-muted">Role label<input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} className={fieldClass} minLength={2} maxLength={60} required /></label>}<label className="space-y-1 text-xs font-semibold text-muted">Name (English)<input value={fullNameEn} onChange={(event) => setFullNameEn(event.target.value)} className={fieldClass} minLength={1} maxLength={120} required /></label><label className="space-y-1 text-xs font-semibold text-muted">Name (Nepali)<input value={fullNameNp} onChange={(event) => setFullNameNp(event.target.value)} className={fieldClass} maxLength={120} /></label><label className="space-y-1 text-xs font-semibold text-muted">Designation (English)<input value={designationEn} onChange={(event) => setDesignationEn(event.target.value)} className={fieldClass} minLength={1} maxLength={80} required /></label><label className="space-y-1 text-xs font-semibold text-muted">Designation (Nepali)<input value={designationNp} onChange={(event) => setDesignationNp(event.target.value)} className={fieldClass} maxLength={80} /></label><label className="space-y-1 text-xs font-semibold text-muted">Valid from<input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} className={fieldClass} required /></label><button disabled={createMutation.isPending} className="self-end rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{createMutation.isPending ? "Adding…" : "Add signatory"}</button></form></section>
      <section className="space-y-3"><h2 className="font-bold text-ink">Signatory history</h2>{signatoriesQuery.isPending ? <div className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-muted">Loading signatories…</div> : signatories.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-panel p-8 text-center text-sm text-muted">No signatories configured yet.</div> : signatories.map((signatory) => <article key={signatory.id} className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-panel p-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{signatory.fullNameEn}</h3><span className="rounded-full bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal">{signatory.roleLabel ?? signatory.role.replaceAll("_", " ")}</span>{signatory.isCurrent && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Current</span>}</div><p className="mt-1 text-sm text-muted">{signatory.designationEn} · {signatory.validFrom} to {signatory.validTo ?? "present"}</p><p className="mt-1 text-xs text-muted">{signatory.mode} mode · {signatory.hasSignature ? "Digital image stored" : "No signature image"}</p></div><div className="flex flex-wrap items-center gap-2"><button onClick={() => setDetailId(signatory.id)} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:border-teal"><Eye size={14} />Details</button><select aria-label={`Signature mode for ${signatory.fullNameEn}`} value={signatory.mode} onChange={(event) => modeMutation.mutate({ id: signatory.id, mode: event.target.value as "DIGITAL" | "LINE" })} className="h-9 rounded-lg border border-line bg-panel px-2 text-xs" disabled={modeMutation.isPending || signatory.mode === "DIGITAL" && !signatory.hasSignature}><option value="DIGITAL">Digital</option><option value="LINE">Signature line</option></select><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:border-teal"><ImageUp size={14} />Upload<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadMutation.mutate({ id: signatory.id, file }); event.target.value = ""; }} /></label>{signatory.hasSignature && <><button onClick={() => void downloadSignature(signatory.id)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:border-teal">Download</button><button aria-label={`Remove signature for ${signatory.fullNameEn}`} onClick={() => { if (window.confirm(`Remove the stored signature for ${signatory.fullNameEn}?`)) removeMutation.mutate(signatory.id); }} className="rounded-lg border border-coral/30 p-2 text-coral hover:bg-coral/5"><Trash2 size={15} /></button></>}</div></article>)}</section>
      {canReadStaff && <section className="space-y-4 rounded-2xl border border-line bg-panel p-5"><div><h2 className="font-bold text-ink">Staff signatures</h2><p className="mt-1 text-xs text-muted">Manage the class-teacher signature used on printed documents.</p></div><select aria-label="Choose staff member" value={staffId} onChange={(event) => setStaffId(event.target.value)} className={`${fieldClass} max-w-xl`}><option value="">Select active staff…</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.staffNo}</option>)}</select>{staffId && staffSignatureQuery.data && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-soft p-4"><span className="text-sm font-semibold text-ink">{staffSignatureQuery.data.mode} mode · {staffSignatureQuery.data.hasSignature ? "Digital image stored" : "No image"}</span><select aria-label="Staff signature mode" value={staffSignatureQuery.data.mode} onChange={(event) => staffModeMutation.mutate(event.target.value as "DIGITAL" | "LINE")} className="h-9 rounded-lg border border-line bg-panel px-2 text-xs" disabled={!staffSignatureQuery.data.hasSignature}><option value="DIGITAL">Digital</option><option value="LINE">Signature line</option></select><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink"><ImageUp size={14} />Upload image<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) staffUploadMutation.mutate(file); event.target.value = ""; }} /></label>{staffSignatureQuery.data.hasSignature && <><button onClick={() => void downloadSignature(staffId, true)} className="rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold">Download</button><button onClick={() => { if (window.confirm("Remove this staff signature image?")) staffRemoveMutation.mutate(); }} className="rounded-lg border border-coral/30 p-2 text-coral"><Trash2 size={15} /></button></>}</div>}{staffSignatureQuery.isError && <p role="alert" className="text-sm text-coral">{message(staffSignatureQuery.error)}</p>}</section>}
      <section className="space-y-4 rounded-2xl border border-line bg-panel p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold text-ink"><ScanEye size={18} className="text-teal" />Letterhead preview</h2><p className="mt-1 text-xs text-muted">Preview metadata and readiness warnings; image bytes are not included.</p></div><div className="flex items-center gap-2"><input aria-label="Preview as of date" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={fieldClass} /><button onClick={() => setShowPreview(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal px-4 text-sm font-bold text-white"><FileSignature size={15} />Preview</button></div></div>{previewQuery.isPending && showPreview && <p className="text-sm text-muted">Assembling letterhead…</p>}{previewQuery.isError && <p role="alert" className="text-sm text-coral">{message(previewQuery.error)}</p>}{previewQuery.data && <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-soft p-3 text-sm text-ink"><p><strong>As of:</strong> {previewQuery.data.asOf}</p><p className="mt-1"><strong>Profile version:</strong> {previewQuery.data.profileVersion ?? "Unavailable"}</p><p className="mt-1"><strong>Logo:</strong> {previewQuery.data.logo ? "Available" : "Not configured"} · <strong>Seal:</strong> {previewQuery.data.seal ? "Available" : "Not configured"}</p></div><div className="rounded-lg bg-soft p-3 text-sm text-ink"><strong>Signatures</strong>{previewQuery.data.signatures.length ? <ul className="mt-1 list-inside list-disc">{previewQuery.data.signatures.map((signature) => <li key={signature.slot}>{signature.nameEn} · {signature.designationEn} · {signature.mode}</li>)}</ul> : <p className="mt-1 text-muted">No matching signatures.</p>}</div>{previewQuery.data.warnings.map((warning) => <p key={warning} className="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{warning}</p>)}</div>}</section>
      {detailId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="signatory-detail-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-panel p-6 shadow-xl"><div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-teal">Signatory record</p><h2 id="signatory-detail-title" className="mt-1 text-lg font-bold text-ink">{detailQuery.data?.fullNameEn ?? "Loading…"}</h2></div><button onClick={() => setDetailId(null)} className="rounded-md border border-line px-3 py-1 text-sm text-muted">Close</button></div>{detailQuery.isPending ? <p className="text-sm text-muted">Loading record…</p> : detailQuery.isError ? <p role="alert" className="text-sm text-coral">{message(detailQuery.error)}</p> : detailQuery.data && <dl className="grid gap-3 rounded-xl bg-soft p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">Role / slot</dt><dd className="mt-1 text-ink">{detailQuery.data.roleLabel ?? detailQuery.data.role} · {detailQuery.data.slot}</dd></div><div><dt className="text-xs text-muted">Designation</dt><dd className="mt-1 text-ink">{detailQuery.data.designationEn}{detailQuery.data.designationNp ? ` · ${detailQuery.data.designationNp}` : ""}</dd></div><div><dt className="text-xs text-muted">Validity</dt><dd className="mt-1 text-ink">{detailQuery.data.validFrom} – {detailQuery.data.validTo ?? "present"}</dd></div><div><dt className="text-xs text-muted">Linked staff</dt><dd className="mt-1 text-ink">{detailQuery.data.staffId ?? "Manual signatory"}</dd></div>{detailQuery.data.signature && <div className="sm:col-span-2"><dt className="text-xs text-muted">Signature image metadata</dt><dd className="mt-1 break-all font-mono text-[11px] text-ink">{detailQuery.data.signature.width}×{detailQuery.data.signature.height} · SHA-256 {detailQuery.data.signature.sha256}</dd></div>}</dl>}</section></div>}
    </main>
  );
}
