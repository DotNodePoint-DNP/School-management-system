"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, CalendarDays, Clock3, LoaderCircle, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { listAcademicYears } from "@/modules/settings/services/academic-setup";
import {
  addAttendanceCalendarEntries,
  convertAttendanceDate,
  deleteAttendanceCalendarEntry,
  getAttendanceCalendar,
  updateAttendanceCalendar,
} from "./services/calendar";
import {
  AttendanceHeader,
  EmptyBox,
  ErrorBox,
  Field,
  formatDate,
  inputClass,
  localDate,
  LoadingBox,
  SelectField,
} from "./components/shared";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type Props = { canManage: boolean };

export default function AttendanceCalendarWorkspace({ canManage }: Props) {
  const queryClient = useQueryClient();
  const [yearSelection, setYearSelection] = useState("");
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[] | null>(null);
  const [editWindowDays, setEditWindowDays] = useState<number | null>(null);
  const [kind, setKind] = useState<"HOLIDAY" | "WORKING_DAY">("HOLIDAY");
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(localDate);
  const [endDate, setEndDate] = useState("");
  const [convertMode, setConvertMode] = useState<"ad" | "bs">("ad");
  const [convertValue, setConvertValue] = useState(localDate);
  const [converted, setConverted] = useState<{ ad: string; bs: string | null } | null>(null);
  const yearsQuery = useQuery({ queryKey: ["attendance", "years"], queryFn: listAcademicYears });
  const years = yearsQuery.data ?? [];
  const yearId = yearSelection || (years.find((item) => item.status === "ACTIVE") ?? years[0])?.id || "";
  const calendarQuery = useQuery({
    queryKey: ["attendance", "calendar", yearId],
    queryFn: () => getAttendanceCalendar(yearId),
    enabled: Boolean(yearId),
    retry: false,
  });
  const offDays = weeklyOffDays ?? calendarQuery.data?.weeklyOffDays ?? [6];
  const windowDays = editWindowDays ?? calendarQuery.data?.attendanceEditWindowDays ?? 3;
  const refreshCalendar = () => queryClient.invalidateQueries({ queryKey: ["attendance", "calendar", yearId] });
  const saveSettings = useMutation({
    mutationFn: () => updateAttendanceCalendar(yearId, {
      weeklyOffDays: offDays,
      attendanceEditWindowDays: windowDays,
    }),
    onSuccess: async (updated) => {
      toast.success("Calendar settings updated.");
      queryClient.setQueryData(["attendance", "calendar", yearId], updated);
      setWeeklyOffDays(null);
      setEditWindowDays(null);
      await refreshCalendar();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The request failed."),
  });
  const addEntry = useMutation({
    mutationFn: () => addAttendanceCalendarEntries(yearId, {
      kind,
      name: name.trim(),
      startDate,
      ...(endDate ? { endDate } : {}),
    }),
    onSuccess: async (entries) => {
      toast.success(`${entries.length} calendar date${entries.length === 1 ? "" : "s"} added.`);
      setName("");
      setEndDate("");
      await refreshCalendar();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The request failed."),
  });
  const removeEntry = useMutation({
    mutationFn: (id: string) => deleteAttendanceCalendarEntry(yearId, id),
    onSuccess: async () => {
      toast.success("Calendar entry removed.");
      await refreshCalendar();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The request failed."),
  });
  const convert = useMutation({
    mutationFn: () => convertAttendanceDate(convertMode === "ad" ? { ad: convertValue } : { bs: convertValue }),
    onSuccess: setConverted,
    onError: (error) => toast.error(error instanceof Error ? error.message : "The request failed."),
  });

  if (yearsQuery.isPending) return <LoadingBox>Loading school calendar…</LoadingBox>;
  if (yearsQuery.isError) return <ErrorBox error={yearsQuery.error} retry={() => void yearsQuery.refetch()} />;
  if (!years.length) return <EmptyBox title="No academic year available">Create an academic year before managing the attendance calendar.</EmptyBox>;

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 text-ink md:p-6">
      <AttendanceHeader title="School calendar" description="Set school days, holidays, make-up days and the attendance correction window." />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-panel p-4">
            <div><h2 className="font-semibold">Calendar settings</h2><p className="mt-1 text-xs text-muted">Settings apply to the selected academic year.</p></div>
            <div className="w-full sm:w-60"><SelectField label="Academic year" onChange={(value) => { setYearSelection(value); setWeeklyOffDays(null); setEditWindowDays(null); }} value={yearId}>{years.map((year) => <option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}</SelectField></div>
          </div>
          {calendarQuery.isPending ? <LoadingBox>Loading calendar dates…</LoadingBox> : calendarQuery.isError ? <ErrorBox error={calendarQuery.error} retry={() => void calendarQuery.refetch()} /> : calendarQuery.data ? (
            <>
              <section className="space-y-4 rounded-lg border border-line bg-panel p-4">
                <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-teal" /><h2 className="font-semibold">Attendance rules</h2></div>
                <fieldset disabled={!canManage || saveSettings.isPending}>
                  <legend className="mb-2 text-xs font-semibold text-muted">Weekly off days</legend>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day, index) => <label className={`cursor-pointer rounded-md border px-3 py-2 text-xs font-semibold ${offDays.includes(index) ? "border-navy bg-navy text-white" : "border-line text-muted"} ${!canManage ? "cursor-not-allowed opacity-60" : ""}`} key={day}><input checked={offDays.includes(index)} className="sr-only" onChange={(event) => setWeeklyOffDays(event.target.checked ? [...offDays, index].sort() : offDays.filter((value) => value !== index))} type="checkbox" />{day}</label>)}
                  </div>
                </fieldset>
                <Field label="Attendance edit window · days"><input className={inputClass} disabled={!canManage} max={30} min={0} onChange={(event) => setEditWindowDays(Number(event.target.value))} type="number" value={windowDays} /></Field>
                {canManage ? <button className="inline-flex h-9 items-center gap-2 rounded-md bg-teal px-3.5 text-xs font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate()} type="button">{saveSettings.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}Save calendar settings</button> : <p className="text-xs text-muted">You can view this calendar but cannot change its settings.</p>}
              </section>
              {canManage && <form className="space-y-3 rounded-lg border border-line bg-panel p-4" onSubmit={(event) => { event.preventDefault(); addEntry.mutate(); }}>
                <div><h2 className="font-semibold">Add calendar dates</h2><p className="mt-1 text-xs text-muted">Add a holiday or make-up working day, optionally across a date range.</p></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Type"><select className={inputClass} onChange={(event) => setKind(event.target.value as "HOLIDAY" | "WORKING_DAY")} value={kind}><option value="HOLIDAY">Holiday</option><option value="WORKING_DAY">Make-up working day</option></select></Field>
                  <Field label="Name"><input className={inputClass} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="e.g. Dashain holiday" required value={name} /></Field>
                  <Field label="Start date · AD"><input className={inputClass} onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} /></Field>
                  <Field label="End date · AD (optional)"><input className={inputClass} min={startDate} onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} /></Field>
                </div>
                <button className="rounded-md border border-line px-3.5 py-2 text-xs font-semibold hover:bg-background disabled:opacity-50" disabled={!name.trim() || addEntry.isPending} type="submit">{addEntry.isPending ? "Adding…" : "Add date"}</button>
              </form>}
              <section className="overflow-hidden rounded-lg border border-line bg-panel">
                <div className="flex items-center justify-between border-b border-line p-4"><div><h2 className="font-semibold">Calendar exceptions</h2><p className="mt-1 text-xs text-muted">{calendarQuery.data.entries.length} entries</p></div><CalendarDays className="h-4 w-4 text-teal" /></div>
                {calendarQuery.data.entries.length ? <div className="divide-y divide-line">{calendarQuery.data.entries.map((entry) => <div className="flex items-center justify-between gap-3 p-4" key={entry.id}><div><p className="text-sm font-semibold">{entry.name}</p><p className="mt-1 text-xs text-muted">{formatDate(entry.date)}{entry.dateBs ? ` · BS ${entry.dateBs}` : ""} · {entry.kind === "HOLIDAY" ? "Holiday" : "Working day"}</p></div>{canManage && <button className="text-xs font-semibold text-coral hover:underline disabled:opacity-50" disabled={removeEntry.isPending} onClick={() => { if (window.confirm(`Remove "${entry.name}" from the calendar?`)) removeEntry.mutate(entry.id); }} type="button">Remove</button>}</div>)}</div> : <p className="p-6 text-center text-sm text-muted">No special calendar dates have been added.</p>}
              </section>
            </>
          ) : null}
        </div>
        <div className="space-y-4">
          <section className="rounded-lg border border-line bg-panel p-4">
            <div className="flex items-center gap-2"><ArrowDownUp className="h-4 w-4 text-teal" /><h2 className="font-semibold">AD / BS date converter</h2></div>
            <p className="mt-1 text-xs text-muted">Convert dates for school records and attendance entry.</p>
            <div className="mt-4 flex gap-2">
              <button className={`rounded-md px-3 py-2 text-xs font-semibold ${convertMode === "ad" ? "bg-navy text-white" : "border border-line text-muted"}`} onClick={() => { setConvertMode("ad"); setConvertValue(localDate()); setConverted(null); }} type="button">AD to BS</button>
              <button className={`rounded-md px-3 py-2 text-xs font-semibold ${convertMode === "bs" ? "bg-navy text-white" : "border border-line text-muted"}`} onClick={() => { setConvertMode("bs"); setConvertValue(""); setConverted(null); }} type="button">BS to AD</button>
            </div>
            <Field label={convertMode === "ad" ? "Gregorian date · AD" : "Bikram Sambat date · YYYY-MM-DD"}><input className={inputClass} onChange={(event) => { setConvertValue(event.target.value); setConverted(null); }} placeholder={convertMode === "bs" ? "2083-01-01" : undefined} type={convertMode === "ad" ? "date" : "text"} value={convertValue} /></Field>
            <button className="mt-3 inline-flex h-9 items-center gap-2 rounded-md bg-teal px-3.5 text-xs font-semibold text-white hover:bg-navy disabled:opacity-50" disabled={!convertValue || convert.isPending} onClick={() => convert.mutate()} type="button">{convert.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}Convert date</button>
            {converted && <div className="mt-3 rounded-md bg-mint p-3 text-sm font-semibold"><p>AD · {converted.ad}</p><p className="mt-1">BS · {converted.bs ?? "Unavailable"}</p></div>}
          </section>
          <section className="rounded-lg border border-line bg-navy p-5 text-white"><span className="inline-grid h-9 w-9 place-items-center rounded-lg bg-white/10"><Clock3 className="h-4 w-4 text-amber" /></span><h2 className="mt-3 font-semibold">Attendance edit window</h2><p className="mt-2 text-xs leading-5 text-white/70">After the configured window, attendance corrections require the appropriate permission and a reason.</p><p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/70">Current window: <strong className="text-white">{calendarQuery.data?.attendanceEditWindowDays ?? windowDays} days</strong></p></section>
        </div>
      </div>
    </main>
  );
}
