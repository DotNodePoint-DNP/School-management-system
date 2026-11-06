"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSchoolProfileVersion,
  listSchoolProfileHistory,
} from "../services/school-profile";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "The profile history could not be loaded.";

export default function SchoolProfileHistory() {
  const [version, setVersion] = useState<number | null>(null);
  const historyQuery = useQuery({
    queryKey: ["school-profile", "history"],
    queryFn: listSchoolProfileHistory,
    retry: false,
  });
  const snapshotQuery = useQuery({
    queryKey: ["school-profile", "history", version],
    queryFn: () => getSchoolProfileVersion(version!),
    enabled: version !== null,
    retry: false,
  });
  const history = historyQuery.data ?? [];
  const profile = snapshotQuery.data?.profile;

  return (
    <section className="mt-6 rounded-xl border border-line bg-panel p-5">
      <div className="border-b border-line pb-4"><h2 className="text-lg font-bold text-ink">Profile version history</h2><p className="mt-1 text-sm text-muted">Inspect previous school-profile snapshots. Historical versions are read-only.</p></div>
      {historyQuery.isPending ? <p className="py-6 text-sm text-muted">Loading profile history…</p> : historyQuery.isError ? <p role="alert" className="py-5 text-sm text-coral">{errorText(historyQuery.error)}</p> : history.length === 0 ? <p className="py-6 text-sm text-muted">No historical profile versions available.</p> : <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(220px,0.65fr)_minmax(0,1.35fr)]">
        <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">{history.map((entry) => <button key={entry.version} aria-pressed={version === entry.version} onClick={() => setVersion(entry.version)} className="w-full p-3 text-left hover:bg-soft aria-pressed:bg-teal/10"><span className="font-semibold text-ink">Version {entry.version}</span><span className="mt-1 block text-xs text-muted">{new Date(entry.changedAt).toLocaleString()}</span><span className="block text-xs text-muted">{entry.changedByName ?? "System"}</span></button>)}</div>
        <div className="min-w-0 rounded-lg bg-soft/60 p-4">{version === null ? <p className="py-8 text-center text-sm text-muted">Choose a version to inspect its snapshot.</p> : snapshotQuery.isPending ? <p className="py-8 text-center text-sm text-muted">Loading snapshot…</p> : snapshotQuery.isError ? <p role="alert" className="text-sm text-coral">{errorText(snapshotQuery.error)}</p> : profile && <div className="space-y-4"><div><p className="text-xs font-bold uppercase tracking-wide text-teal">Version {snapshotQuery.data.version}</p><h3 className="mt-1 text-lg font-bold text-ink">{profile.nameEn}</h3>{profile.nameNp && <p className="text-sm text-muted">{profile.nameNp}</p>}</div><dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">{[
          ["School type", profile.schoolType],
          ["Established", profile.establishedOn ?? profile.establishedOnBs],
          ["Address", [profile.tole, profile.wardNo ? `Ward ${profile.wardNo}` : null, profile.localLevel, profile.district, profile.province].filter(Boolean).join(", ")],
          ["Email", profile.email],
          ["Website", profile.website],
          ["Admission prefix", profile.admissionNoPrefix],
          ["Staff prefix", profile.staffNoPrefix],
          ["Document language", profile.documentLanguage],
        ].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold text-muted">{label}</dt><dd className="mt-0.5 break-words text-ink">{value || "—"}</dd></div>)}</dl><div><h4 className="text-xs font-semibold text-muted">Contact numbers</h4>{profile.phones.length ? <ul className="mt-1 space-y-1 text-sm text-ink">{profile.phones.map((phone) => <li key={`${phone.label}-${phone.number}`}>{phone.label}: {phone.number}</li>)}</ul> : <p className="mt-1 text-sm text-muted">No phone numbers recorded.</p>}</div></div>}</div>
      </div>}
    </section>
  );
}
