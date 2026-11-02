"use client";

import {
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Check,
  Clipboard,
  LoaderCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { RbacRole } from "@/modules/settings/services/rbac";
import type {
  StaffDetails,
  StaffInput,
  StaffLeaveInput,
  StaffLoginResult,
  StaffUpdateInput,
} from "../services/staff";
import { AdmissionField, formFieldClass } from "@/modules/admissions/components/shared";

const panelClass =
  "fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm";

function DialogFrame({
  title,
  description,
  onClose,
  children,
  size = "max-w-2xl",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  size?: string;
}) {
  return (
    <div
      className={panelClass}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="staff-dialog-title"
        aria-modal="true"
        className={`relative max-h-[92vh] w-full ${size} overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl`}
        role="dialog"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-panel/95 px-5 py-4 backdrop-blur md:px-7">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink" id="staff-dialog-title">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <button
            aria-label="Close dialog"
            className="rounded-lg p-2 text-muted transition hover:bg-background hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function todayLocalDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function latestPastDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function optionalValue(form: FormData, name: string): string | undefined {
  const value = String(form.get(name) ?? "").trim();
  return value || undefined;
}

export function StaffFormDialog({
  staff,
  isSaving,
  onClose,
  onSubmit,
}: {
  staff: StaffDetails | null;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: StaffInput | StaffUpdateInput) => void;
}) {
  const isEdit = Boolean(staff);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const firstName = optionalValue(form, "firstName");
    const lastName = optionalValue(form, "lastName");
    const gender = optionalValue(form, "gender") as StaffInput["gender"] | undefined;
    const kind = optionalValue(form, "kind") as StaffInput["kind"] | undefined;
    const input: StaffUpdateInput = {
      ...(firstName ? { firstName } : {}),
      ...(optionalValue(form, "middleName") ? { middleName: optionalValue(form, "middleName") } : {}),
      ...(lastName ? { lastName } : {}),
      ...(optionalValue(form, "fullNameNp") ? { fullNameNp: optionalValue(form, "fullNameNp") } : {}),
      ...(gender ? { gender } : {}),
      ...(optionalValue(form, "dateOfBirth") ? { dateOfBirth: optionalValue(form, "dateOfBirth") } : {}),
      ...(optionalValue(form, "joinDate") ? { joinDate: optionalValue(form, "joinDate") } : {}),
      ...(optionalValue(form, "phone") ? { phone: optionalValue(form, "phone") } : {}),
      ...(optionalValue(form, "email") ? { email: optionalValue(form, "email") } : {}),
      ...(optionalValue(form, "address") ? { address: optionalValue(form, "address") } : {}),
      ...(kind ? { kind } : {}),
      ...(optionalValue(form, "designation") ? { designation: optionalValue(form, "designation") } : {}),
      ...(!isEdit && optionalValue(form, "staffNo") ? { staffNo: optionalValue(form, "staffNo") } : {}),
    };
    if (!isEdit) {
      if (!firstName || !lastName || !gender || !kind || !input.joinDate) return;
      onSubmit({ ...input, firstName, lastName, gender, kind, joinDate: input.joinDate });
      return;
    }
    onSubmit(input);
  }

  return (
    <DialogFrame
      description={isEdit ? "Update this staff member’s profile. Empty optional fields are left unchanged." : "Create a staff record. Staff numbers are generated automatically unless you provide one."}
      onClose={onClose}
      title={isEdit ? "Edit staff profile" : "Add a staff member"}
    >
      <form className="space-y-6 p-5 md:p-7" onSubmit={submit}>
        <section>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-teal">Personal details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdmissionField label="First name" required={!isEdit}><input autoComplete="given-name" className={formFieldClass} maxLength={60} name="firstName" required={!isEdit} defaultValue={staff?.firstName ?? ""} /></AdmissionField>
            <AdmissionField label="Middle name"><input className={formFieldClass} maxLength={60} name="middleName" defaultValue={staff?.middleName ?? ""} /></AdmissionField>
            <AdmissionField label="Last name" required={!isEdit}><input autoComplete="family-name" className={formFieldClass} maxLength={60} name="lastName" required={!isEdit} defaultValue={staff?.lastName ?? ""} /></AdmissionField>
            <AdmissionField label="Name in Nepali"><input className={formFieldClass} maxLength={150} name="fullNameNp" defaultValue={staff?.fullNameNp ?? ""} /></AdmissionField>
            <AdmissionField label="Gender" required={!isEdit}>
              <select className={formFieldClass} defaultValue={staff?.gender ?? ""} name="gender" required={!isEdit}>
                <option value="">Select gender</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
              </select>
            </AdmissionField>
            <AdmissionField label="Staff number" hint={isEdit ? "Staff number cannot be changed." : "Optional · generated automatically if blank."}>
              <input className={formFieldClass} defaultValue={staff?.staffNo ?? ""} disabled={isEdit} maxLength={30} name="staffNo" pattern="[A-Za-z0-9][A-Za-z0-9/_-]{0,29}" />
            </AdmissionField>
            <AdmissionField label="Date of birth · AD"><input className={formFieldClass} defaultValue={staff?.dateOfBirth ?? ""} max={latestPastDate()} name="dateOfBirth" type="date" /></AdmissionField>
            <AdmissionField label="Joining date · AD" required={!isEdit}><input className={formFieldClass} defaultValue={staff?.joinDate ?? ""} name="joinDate" required={!isEdit} type="date" /></AdmissionField>
          </div>
        </section>
        <section>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-teal">Role and contact</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdmissionField label="Staff category" required={!isEdit}>
              <select className={formFieldClass} defaultValue={staff?.kind ?? ""} name="kind" required={!isEdit}>
                <option value="">Select category</option><option value="TEACHING">Teaching staff</option><option value="NON_TEACHING">Non-teaching staff</option>
              </select>
            </AdmissionField>
            <AdmissionField label="Designation"><input className={formFieldClass} defaultValue={staff?.designation ?? ""} maxLength={80} name="designation" placeholder="e.g. Mathematics Teacher" /></AdmissionField>
            <AdmissionField label="Phone number"><input autoComplete="tel" className={formFieldClass} defaultValue={staff?.phone ?? ""} maxLength={20} name="phone" type="tel" /></AdmissionField>
            <AdmissionField label="Email address"><input autoComplete="email" className={formFieldClass} defaultValue={staff?.email ?? ""} maxLength={254} name="email" type="email" /></AdmissionField>
            <div className="sm:col-span-2"><AdmissionField label="Address"><textarea autoComplete="street-address" className={formFieldClass} defaultValue={staff?.address ?? ""} maxLength={255} name="address" rows={2} /></AdmissionField></div>
          </div>
        </section>
        <footer className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-background" onClick={onClose} type="button">Cancel</button>
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy disabled:opacity-50" disabled={isSaving} type="submit">
            {isSaving && <LoaderCircle className="size-4 animate-spin" />}
            {isSaving ? "Saving…" : isEdit ? "Save changes" : "Create staff profile"}
          </button>
        </footer>
      </form>
    </DialogFrame>
  );
}

export function StaffDetailDialog({
  staff,
  canManage,
  canCreateLogin,
  canReadRoles,
  onClose,
  onEdit,
  onLeave,
  onReactivate,
  onCreateLogin,
  onDelete,
}: {
  staff: StaffDetails;
  canManage: boolean;
  canCreateLogin: boolean;
  canReadRoles: boolean;
  onClose: () => void;
  onEdit: () => void;
  onLeave: () => void;
  onReactivate: () => void;
  onCreateLogin: () => void;
  onDelete: () => void;
}) {
  const displayName = [staff.firstName, staff.middleName, staff.lastName].filter(Boolean).join(" ");
  return (
    <DialogFrame description={`Staff no. ${staff.staffNo}`} onClose={onClose} size="max-w-xl" title={displayName}>
      <div className="space-y-5 p-5 md:p-7">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-teal">{staff.kind === "TEACHING" ? "Teaching" : "Non-teaching"}</span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${staff.status === "ACTIVE" ? "bg-teal/10 text-teal" : "bg-coral/10 text-coral"}`}>{staff.status === "ACTIVE" ? "Active" : "Left"}</span>
          <span className="rounded-full bg-background px-3 py-1 text-xs font-medium text-muted">{staff.hasLogin ? "Portal login enabled" : "No portal login"}</span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <DetailItem label="Designation" value={staff.designation} />
          <DetailItem label="Gender" value={staff.gender} />
          <DetailItem label="Phone" value={staff.phone} />
          <DetailItem label="Email" value={staff.email} />
          <DetailItem label="Date of birth" value={staff.dateOfBirth} />
          <DetailItem label="Joined" value={staff.joinDate} />
          <DetailItem label="Address" value={staff.address} wide />
          {staff.status === "LEFT" && <DetailItem label="Left on" value={staff.leftOn} />}
          {staff.statusNote && <DetailItem label="Departure note" value={staff.statusNote} wide />}
        </dl>
        {canCreateLogin && !canReadRoles && !staff.hasLogin && staff.status === "ACTIVE" && (
          <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-xs text-muted">Role selection requires the roles-read permission. Ask an administrator to grant it before creating a login.</p>
        )}
        {canCreateLogin && canReadRoles && !staff.hasLogin && staff.status === "ACTIVE" && !staff.email && !staff.phone && (
          <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-xs text-muted">Add an email address or phone number to this profile before creating a portal login.</p>
        )}
        <footer className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {canManage && staff.status === "ACTIVE" && <button className="rounded-lg border border-coral/30 px-3 py-2 text-xs font-semibold text-coral hover:bg-coral/5" onClick={onLeave} type="button">Record departure</button>}
          {canManage && staff.status === "LEFT" && <button className="rounded-lg border border-teal/30 px-3 py-2 text-xs font-semibold text-teal hover:bg-mint" onClick={onReactivate} type="button">Reactivate</button>}
          {canCreateLogin && canReadRoles && !staff.hasLogin && staff.status === "ACTIVE" && (staff.email || staff.phone) && <button className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink hover:bg-background" onClick={onCreateLogin} type="button">Create portal login</button>}
          {canManage && <button className="rounded-lg bg-teal px-4 py-2 text-xs font-semibold text-white hover:bg-navy" onClick={onEdit} type="button">Edit profile</button>}
          {canManage && <button aria-label="Delete staff record" className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted hover:border-coral/40 hover:text-coral" onClick={onDelete} type="button">Delete</button>}
        </footer>
      </div>
    </DialogFrame>
  );
}

function DetailItem({ label, value, wide = false }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={`rounded-lg bg-background p-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-ink">{value || "Not provided"}</dd>
    </div>
  );
}

export function StaffLeaveDialog({
  staff,
  isSaving,
  onClose,
  onSubmit,
}: {
  staff: StaffDetails;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (input: StaffLeaveInput) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    const leftOn = optionalValue(form, "leftOn");
    onSubmit({ reason, ...(leftOn ? { leftOn } : {}) });
  }

  return (
    <DialogFrame description="This also deactivates the linked login. Open-year teaching assignments must be removed first." onClose={onClose} size="max-w-lg" title="Record staff departure">
      <form className="space-y-4 p-5 md:p-7" onSubmit={submit}>
        <div className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-ink">
          Recording departure for <strong>{staff.firstName} {staff.lastName}</strong> · {staff.staffNo}
        </div>
        <AdmissionField label="Last working date · AD" hint="Defaults to today if left blank.">
          <input className={formFieldClass} defaultValue={todayLocalDate()} max={todayLocalDate()} name="leftOn" type="date" />
        </AdmissionField>
        <AdmissionField label="Departure reason" required hint="10–500 characters. This will be saved as the staff status note.">
          <textarea className={formFieldClass} maxLength={500} minLength={10} name="reason" required rows={4} />
        </AdmissionField>
        <footer className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <button className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold" onClick={onClose} type="button">Cancel</button>
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-coral px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={isSaving} type="submit">
            {isSaving && <LoaderCircle className="size-4 animate-spin" />}Confirm departure
          </button>
        </footer>
      </form>
    </DialogFrame>
  );
}

export function StaffLoginDialog({
  staff,
  roles,
  isLoadingRoles,
  rolesError,
  isSaving,
  result,
  onClose,
  onSubmit,
  onRetryRoles,
}: {
  staff: StaffDetails;
  roles: RbacRole[];
  isLoadingRoles: boolean;
  rolesError: unknown;
  isSaving: boolean;
  result: StaffLoginResult | null;
  onClose: () => void;
  onSubmit: (roleIds: string[]) => void;
  onRetryRoles: () => void;
}) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
      toast.error("Clipboard access failed. Select and copy the password manually.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(selectedRoles);
  }

  return (
    <DialogFrame
      description={result ? "The temporary password is shown once. Share it securely with the staff member." : "Choose the access roles for this staff member’s portal account."}
      onClose={onClose}
      size="max-w-lg"
      title={result ? "Login created" : `Create login · ${staff.firstName} ${staff.lastName}`}
    >
      {result ? (
        <div className="space-y-4 p-5 md:p-7">
          <div className="rounded-xl border border-teal/30 bg-mint/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-teal"><Check className="size-4" /> Account provisioned</div>
            <p className="mt-2 text-xs text-muted">Temporary password</p>
            <code className="mt-1 block select-all break-all rounded-lg bg-panel px-3 py-3 font-mono text-base font-bold tracking-wide text-ink">{result.temporaryPassword}</code>
            <button className="mt-3 inline-flex items-center gap-2 rounded-lg border border-teal/30 px-3 py-2 text-xs font-semibold text-teal hover:bg-panel" onClick={() => void copyPassword()} type="button">
              {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
              {copied ? "Copied" : "Copy password"}
            </button>
          </div>
          <p className="text-xs text-muted">Ask the staff member to change this password at their first sign-in. Close this dialog when you’ve shared it securely.</p>
          <div className="flex justify-end"><button className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white" onClick={onClose} type="button">Done</button></div>
        </div>
      ) : (
        <form className="space-y-4 p-5 md:p-7" onSubmit={submit}>
          <div className="rounded-lg bg-background p-3 text-xs text-muted">The staff profile must have an email address or phone number. The API will enforce the current account’s role-assignment policy.</div>
          {isLoadingRoles ? <div className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" />Loading available roles…</div> : rolesError ? (
            <div className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm text-ink">
              <p>{rolesError instanceof Error ? rolesError.message : "Could not load roles."}</p>
              <button className="mt-2 text-xs font-semibold text-teal underline" onClick={onRetryRoles} type="button">Retry</button>
            </div>
          ) : roles.length ? (
            <fieldset className="space-y-2" disabled={isSaving}>
              <legend className="mb-2 text-xs font-semibold text-ink">Assign one or more roles (1–10)</legend>
              {roles.map((role) => (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 transition hover:border-teal/40 has-checked:border-teal/50 has-checked:bg-mint/40" key={role.id}>
                  <input checked={selectedRoles.includes(role.id)} className="mt-0.5 accent-teal" onChange={(event) => setSelectedRoles((current) => event.target.checked ? [...current, role.id] : current.filter((id) => id !== role.id))} type="checkbox" />
                  <span><span className="block text-sm font-semibold text-ink">{role.name}</span><span className="mt-0.5 block text-xs text-muted">{role.description || `${role.userCount} account${role.userCount === 1 ? "" : "s"} currently assigned`}</span></span>
                </label>
              ))}
            </fieldset>
          ) : <p className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-muted">No roles are available for assignment.</p>}
          <footer className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <button className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold" onClick={onClose} type="button">Cancel</button>
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={isSaving || isLoadingRoles || Boolean(rolesError) || !selectedRoles.length || selectedRoles.length > 10} type="submit">
              {isSaving && <LoaderCircle className="size-4 animate-spin" />}Create login
            </button>
          </footer>
        </form>
      )}
    </DialogFrame>
  );
}
