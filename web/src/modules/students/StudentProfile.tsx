import {
  BookOpen,
  ContactRound,
  Fingerprint,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";

export interface Placement {
  className: string;
  sectionName: string;
  rollNo: number | null;
  status: string;
  academicYear?: { name: string };
}

export interface ProfileRecord {
  name: string;
  nameNp: string | null;
  admissionNo: string;
  status: string;
  gender: string;
  dateOfBirth: string;
  dateOfBirthBs: string | null;
  admissionDate: string;
  admissionDateBs: string | null;
  statusChangedOn: string | null;
  statusChangedOnBs?: string | null;
  address?: string | null;
  statusNote?: string | null;
  guardians: {
    name: string;
    relationship: string;
    isPrimary: boolean;
    isEmergencyContact?: boolean;
    phone?: string | null;
    email?: string | null;
    hasLogin?: boolean;
    portalAccess?: boolean;
  }[];
}

const readable = (value: string) => value.replaceAll("_", " ").toLowerCase();
const panel = "min-w-0 rounded-xl border border-line bg-panel p-5 sm:p-6";
const heading = "mb-4 flex items-center gap-2 text-lg font-semibold text-ink";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">
        {children ?? "Not recorded"}
      </dd>
    </div>
  );
}

function dates(ad: string, bs?: string | null) {
  return (
    <>
      {ad} <span className="font-normal text-muted">AD</span>
      {bs && (
        <span className="mt-0.5 block text-xs font-normal text-muted">
          {bs} BS
        </span>
      )}
    </>
  );
}

function ProfilePhoto({ path }: { path?: string }) {
  const photo = useQuery({ queryKey: ["student-photo", path], queryFn: () => createApiClient().getBlob(path!), enabled: Boolean(path) });
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!photo.data?.size || !image.current) return;
    const url = URL.createObjectURL(photo.data);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo.data]);
  // The authenticated API returns a private blob URL that the Next image optimizer cannot fetch.
  // eslint-disable-next-line @next/next/no-img-element
  if (photo.data?.size) return <img ref={image} alt="Student profile photo" className="size-20 rounded-2xl object-cover sm:size-28" />;
  return (<div
            role="img"
            aria-label="Student photo placeholder"
            className="grid size-20 shrink-0 place-content-center justify-items-center gap-1 rounded-2xl border border-white/30 bg-white/10 sm:size-28"
          >
            <UserRound
              aria-hidden="true"
              className="size-8 sm:size-10"
              strokeWidth={1.4}
            />
            <span className="text-[10px] tracking-wide text-white/80">
              No photo
            </span>
          </div>);
}

export function StudentProfile({
  record,
  current,
  history,
  photoPath,
}: {
  record: ProfileRecord;
  current?: Placement | null;
  history?: Placement[];
  photoPath?: string;
}) {
  return (
    <div className="min-w-0 space-y-4 text-ink">
      <header className="relative isolate overflow-hidden rounded-2xl bg-navy p-5 text-white sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-32 -z-10 size-80 rotate-45 rounded-[4rem] border-[24px] border-white/5"
        />
        <div className="flex flex-wrap items-center gap-5">
          <ProfilePhoto path={photoPath} />
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/75">
              Student profile
            </p>
            <h1 className="mt-1 break-words text-3xl font-bold tracking-tight sm:text-4xl">
              {record.name}
            </h1>
            {record.nameNp && (
              <p lang="ne" className="mt-1 break-words text-white/85">
                {record.nameNp}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-white/15 px-3 py-1 font-semibold capitalize">
                {readable(record.status)}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5 break-all">
                <Fingerprint size={16} />
                Admission {record.admissionNo}
              </span>
            </div>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4 sm:grid-cols-3">
          {[
            ["Class", current?.className ?? "No current placement"],
            ["Section", current?.sectionName ?? "—"],
            ["Roll number", current?.rollNo ?? "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-white/75">{label}</dt>
              <dd className="mt-1 break-words font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className={panel}>
          <h2 className={heading}>
            <ContactRound size={20} className="text-teal" />
            Personal record
          </h2>
          <dl className="grid gap-5 sm:grid-cols-2">
            <Fact label="Date of birth">
              {dates(record.dateOfBirth, record.dateOfBirthBs)}
            </Fact>
            <Fact label="Admission date">
              {dates(record.admissionDate, record.admissionDateBs)}
            </Fact>
            <Fact label="Gender">
              <span className="capitalize">{readable(record.gender)}</span>
            </Fact>
            {record.address !== undefined && (
              <Fact label="Address">{record.address}</Fact>
            )}
            {record.statusChangedOn && (
              <Fact label="Status changed">
                {dates(record.statusChangedOn, record.statusChangedOnBs)}
              </Fact>
            )}
            {record.statusNote && (
              <Fact label="Status reason">{record.statusNote}</Fact>
            )}
          </dl>
        </section>
        <section className={panel}>
          <h2 className={heading}>
            <UsersRound size={20} className="text-teal" />
            Guardians
          </h2>
          {record.guardians.length === 0 && (
            <p className="text-sm text-muted">No guardians recorded.</p>
          )}
          <ul className="divide-y divide-line">
            {record.guardians.map((g, i) => (
              <li key={i} className="space-y-1 py-3 first:pt-0 last:pb-0">
                <p className="break-words font-semibold">{g.name}</p>
                <p className="text-sm capitalize text-muted">
                  {readable(g.relationship)}
                  {g.isPrimary && " · Primary"}
                  {g.isEmergencyContact && " · Emergency contact"}
                </p>
                {g.phone && <p className="break-all text-sm">{g.phone}</p>}
                {g.email && <p className="break-all text-sm">{g.email}</p>}
                {g.portalAccess !== undefined && <p className="text-xs text-muted">Access to this child: {g.portalAccess ? "on" : "off"}</p>}
                {g.hasLogin !== undefined && (
                  <p className="text-xs text-muted">
                    Portal account {g.hasLogin ? "linked" : "not linked"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className={panel}>
        <h2 className={heading}>
          <BookOpen size={20} className="text-teal" />
          {history ? "Enrollment history" : "Academic placement"}
        </h2>
        {(history ?? (current ? [current] : [])).map((p, i) => (
          <div
            key={i}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 text-sm"
          >
            <div>
              <p className="font-semibold">
                {p.academicYear?.name ?? "Active academic year"}
              </p>
              <p className="text-muted">
                {p.className} · {p.sectionName}
                {p.rollNo != null && ` · Roll ${p.rollNo}`}
              </p>
            </div>
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold capitalize">
              {readable(p.status)}
            </span>
          </div>
        ))}
        {(history ? !history.length : !current) && (
          <p className="text-sm text-muted">
            No {history ? "enrollments recorded" : "active-year placement"}.
          </p>
        )}
      </section>
    </div>
  );
}
