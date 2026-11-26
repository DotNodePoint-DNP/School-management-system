"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  attendance,
  type Policy,
  type RequestKind,
  type StaffRequest,
} from "./service";

const root = "staff-attendance";
const tz = "Asia/Kathmandu";
const stamp = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        timeZone: tz,
        dateStyle: "medium",
        timeStyle: "medium",
      })
    : "—";
const labels = {
  LEAVE: "Leave",
  MISSED_IN: "Missed check-in",
  MISSED_OUT: "Missed check-out",
};
const card =
  "space-y-4 rounded-xl border border-line bg-panel text-ink p-5 shadow-sm";
const btn =
  "rounded-lg bg-ink px-4 py-2 text-sm font-medium text-panel disabled:bg-line disabled:text-ink";
const field = "rounded-md border border-muted bg-background px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-ink";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
function useAction() {
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSettled: () => queries.invalidateQueries({ queryKey: [root] }),
  });
}
function Feedback({ error, done }: { error: Error | null; done?: boolean }) {
  if (error)
    return (
      <p role="alert" className="text-sm text-red-700 [.dark_&]:text-red-300">
        {error.message}
      </p>
    );
  return done ? (
    <p role="status" className="text-sm text-green-700 [.dark_&]:text-green-300">
      Saved.
    </p>
  ) : null;
}
function data(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  return new FormData(e.currentTarget);
}
function text(f: FormData, k: string) {
  return String(f.get(k) ?? "");
}

function PolicyForm({ policy }: { policy: Policy | null }) {
  const save = useAction();
  function submit(e: FormEvent<HTMLFormElement>) {
    const f = data(e);
    save.mutate(() =>
      attendance.savePolicy({
        name: text(f, "name"),
        latitude: Number(f.get("latitude")),
        longitude: Number(f.get("longitude")),
        radius: Number(f.get("radius")),
        startsAt: text(f, "startsAt"),
        endsAt: text(f, "endsAt"),
        grace: Number(f.get("grace")),
        offDays: f.getAll("offDays").map(Number),
      }),
    );
  }
  return (
    <form className={card} onSubmit={submit}>
      <h2 className="text-lg font-semibold">
        School location and working hours
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="School location name">
          <input
            className={field}
            name="name"
            required
            maxLength={120}
            defaultValue={policy?.name}
          />
        </Field>
        <Field label="Latitude">
          <input
            className={field}
            name="latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            required
            defaultValue={policy?.latitude}
          />
        </Field>
        <Field label="Longitude">
          <input
            className={field}
            name="longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            required
            defaultValue={policy?.longitude}
          />
        </Field>
        <Field label="Campus radius (meters)">
          <input
            className={field}
            name="radius"
            type="number"
            min="10"
            max="5000"
            required
            defaultValue={policy?.radius ?? 100}
          />
        </Field>
        <Field label="Shift starts">
          <input
            className={field}
            name="startsAt"
            type="time"
            required
            defaultValue={policy?.startsAt ?? "09:00"}
          />
        </Field>
        <Field label="Shift ends">
          <input
            className={field}
            name="endsAt"
            type="time"
            required
            defaultValue={policy?.endsAt ?? "17:00"}
          />
        </Field>
        <Field label="Arrival grace (minutes)">
          <input
            className={field}
            name="grace"
            type="number"
            min="0"
            max="120"
            required
            defaultValue={policy?.grace ?? 0}
          />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Weekly days off</legend>
        <div className="flex flex-wrap gap-3">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
            <label key={day}>
              <input
                type="checkbox"
                name="offDays"
                value={i}
                defaultChecked={(policy?.offDays ?? [6]).includes(i)}
              />{" "}
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <button className={btn} disabled={save.isPending}>
        Save school settings
      </button>
      <Feedback error={save.error} done={save.isSuccess} />
    </form>
  );
}

function RequestForm({ today }: { today: string }) {
  const [kind, setKind] = useState<RequestKind>("LEAVE");
  const save = useAction();
  function submit(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const f = data(e);
    const fromDate = text(f, "fromDate");
    save.mutate(
      () =>
        attendance.submit({
          kind,
          fromDate,
          toDate: kind === "LEAVE" ? text(f, "toDate") : fromDate,
          reason: text(f, "reason"),
          proposedAt:
            kind === "LEAVE"
              ? undefined
              : fromDate + "T" + text(f, "time") + ":00+05:45",
        }),
      { onSuccess: () => form.reset() },
    );
  }
  return (
    <form className={card} onSubmit={submit}>
      <h2 className="text-lg font-semibold">Request leave or a missed punch</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Request">
          <select
            className={field}
            value={kind}
            onChange={(e) => setKind(e.target.value as RequestKind)}
          >
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From date">
          <input
            className={field}
            type="date"
            name="fromDate"
            required
            defaultValue={today}
            max={kind !== "LEAVE" ? today : undefined}
          />
        </Field>
        {kind === "LEAVE" ? (
          <Field label="Through date">
            <input
              className={field}
              type="date"
              name="toDate"
              required
              defaultValue={today}
            />
          </Field>
        ) : (
          <Field label="Time in Nepal">
            <input className={field} type="time" name="time" required />
          </Field>
        )}
      </div>
      <Field label="Reason">
        <textarea className={field} name="reason" required maxLength={500} />
      </Field>
      <button className={btn} disabled={save.isPending}>
        Submit request
      </button>
      <Feedback error={save.error} done={save.isSuccess} />
    </form>
  );
}

function RequestDetails({ row }: { row: StaffRequest }) {
  return (
    <>
      <p className="font-medium">
        {labels[row.kind]} · {row.fromDate.slice(0, 10)}
        {row.fromDate !== row.toDate && " through " + row.toDate.slice(0, 10)}
        {row.proposedAt && " · " + stamp(row.proposedAt)}
      </p>
      <p className="break-words">{row.reason}</p>
      <p className="text-sm text-ink/80">
        Submitted {stamp(row.createdAt)} · {row.status.toLowerCase()}
        {row.reviewedAt && " " + stamp(row.reviewedAt)}
      </p>
      {row.reviewNote && <p>Reviewer response · {row.reviewNote}</p>}
    </>
  );
}

function Personal({ userId }: { userId: string }) {
  const mine = useQuery({
    queryKey: [root, "me", userId],
    queryFn: attendance.mine,
    refetchInterval: 60000,
  });
  const punch = useAction();
  if (mine.error) return <Feedback error={mine.error} />;
  if (!mine.data) return <p>Loading staff record…</p>;
  const { today, campus, punches, requests } = mine.data;
  const todays = punches.filter((p) => p.workDate.startsWith(today));
  const kind = todays.some((p) => p.kind === "IN") ? "OUT" : "IN";
  const complete = todays.some((p) => p.kind === "OUT");
  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-semibold">My attendance · {today}</h2>
        <p>{campus ?? "An administrator needs to set the school location."}</p>
        <p className="text-sm">
          Location is requested when you check in or out.
        </p>
        {complete ? (
          <p>Attendance complete for today.</p>
        ) : (
          <button
            className={btn}
            disabled={!campus || punch.isPending}
            onClick={() => punch.mutate(() => attendance.punch(kind, today))}
          >
            {punch.isPending
              ? "Checking location…"
              : kind === "IN"
                ? "Check in"
                : "Check out"}
          </button>
        )}
        <Feedback error={punch.error} />
        <h3 className="font-medium">Recent punches</h3>
        {!punches.length ? (
          <p>No punches recorded.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-line">
            {punches.map((p) => (
              <li className="py-2" key={p.id}>
                {p.kind === "IN" ? "Check-in" : "Check-out"} · {stamp(p.at)}
                {p.requestId && " · Approved correction"}
              </li>
            ))}
          </ul>
        )}
      </section>
      <RequestForm today={today} />
      <section className={card}>
        <h2 className="text-lg font-semibold">My requests</h2>
        {!requests.length && <p>No requests yet.</p>}
        {requests.map((row) => (
          <article key={row.id} className="border-t border-line py-2">
            <RequestDetails row={row} />
          </article>
        ))}
      </section>
    </>
  );
}

function Decision({ row }: { row: StaffRequest }) {
  const save = useAction();
  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        const f = data(e);
        const button = (e.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement;
        save.mutate(() =>
          attendance.review(row.id, button.value, text(f, "note")),
        );
      }}
    >
      <h3 className="font-semibold">
        {row.staff?.firstName} {row.staff?.lastName} · {row.staff?.staffNo}
      </h3>
      <RequestDetails row={row} />
      <Field label="Decision reason">
        <input className={field} name="note" required maxLength={500} />
      </Field>
      <div className="flex gap-2">
        <button className={btn} value="APPROVED" disabled={save.isPending}>
          Approve
        </button>
        <button className={btn} value="REJECTED" disabled={save.isPending}>
          Reject
        </button>
      </div>
      <Feedback error={save.error} />
    </form>
  );
}

function Office() {
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const register = useQuery({
    queryKey: [root, "register", date],
    queryFn: () => attendance.register(date),
    enabled: !!date,
    refetchInterval: 60000,
  });
  const requests = useQuery({
    queryKey: [root, "requests"],
    queryFn: attendance.requests,
  });
  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-semibold">Daily staff register</h2>
        <Field label="Register date">
          <input
            type="date"
            className={field}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Feedback error={register.error} />
        {register.data ? (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Staff",
                    "Status",
                    "Check-in",
                    "Check-out",
                    "Worked minutes",
                  ].map((k) => (
                    <th key={k} className="p-2">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {register.data.map((r) => (
                  <tr key={r.staffNo} className="border-t border-line">
                    <td className="p-2">
                      {r.name} · {r.staffNo}
                    </td>
                    <td className="p-2">
                      {r.status}
                      {r.late && " · Late"}
                      {r.early && " · Early departure"}
                    </td>
                    <td className="p-2">{stamp(r.checkIn)}</td>
                    <td className="p-2">{stamp(r.checkOut)}</td>
                    <td className="p-2">{r.minutes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!register.data.length && <p>No staff for this date.</p>}
          </div>
        ) : (
          register.isLoading && <p>Loading register…</p>
        )}
      </section>
      <section className={card}>
        <h2 className="text-lg font-semibold">Requests awaiting review</h2>
        <Feedback error={requests.error} />
        {requests.isLoading && <p>Loading requests…</p>}
        {requests.data?.length === 0 && <p>No pending requests.</p>}
        {requests.data?.map((row) => (
          <Decision row={row} key={row.id} />
        ))}
      </section>
    </>
  );
}

export default function StaffAttendanceWorkspace({
  userId,
  self,
  review,
  admin,
}: {
  userId: string;
  self: boolean;
  review: boolean;
  admin: boolean;
}) {
  const [tab, setTab] = useState(
    self ? "My attendance" : review ? "Office register" : "School settings",
  );
  const policy = useQuery({
    queryKey: [root, "policy"],
    queryFn: attendance.policy,
    enabled: admin,
  });
  const tabs = [
    ...(self ? ["My attendance"] : []),
    ...(review ? ["Office register"] : []),
    ...(admin ? ["School settings"] : []),
  ];
  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 text-ink sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold">Staff attendance &amp; leave</h1>
        <p className="text-sm text-ink/80">
          All times are shown in Nepal time.
        </p>
      </header>
      <nav
        aria-label="Staff attendance sections"
        className="flex flex-wrap gap-2"
      >
        {tabs.map((t) => (
          <button
            key={t}
            aria-pressed={t === tab}
            className={t === tab ? btn : "rounded-lg border border-line bg-panel px-4 py-2 text-sm text-ink hover:bg-background"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "My attendance" && self && <Personal userId={userId} />}
      {tab === "Office register" && review && <Office />}
      {tab === "School settings" &&
        admin &&
        (policy.isLoading ? (
          <p>Loading settings…</p>
        ) : policy.error ? (
          <Feedback error={policy.error} />
        ) : (
          <PolicyForm policy={policy.data ?? null} />
        ))}
    </main>
  );
}
