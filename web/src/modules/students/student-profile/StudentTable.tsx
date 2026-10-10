// modules/student-info/components/StudentTable.tsx
"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  fullName,
  studentHref,
  type Student,
} from "../student";

export function StudentTable({ students }: { students: Student[] }) {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const classes = [...new Set(students.map((s) => s.academicRecord.class))];

  const rows = useMemo(
    () =>
      students.filter((s) => {
        const text =
          `${fullName(s)} ${s.studentId} ${s.symbolNumber}`.toLowerCase();
        return (
          text.includes(q.toLowerCase()) &&
          (cls === "all" || s.academicRecord.class === cls)
        );
      }),
    [students, q, cls],
  ); // add server-side pagination when you reach 100s

  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap gap-3 border-b border-line p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, student ID, symbol no."
          className="min-w-64 flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm text-ink outline-none focus:border-teal"
        />
        <select
          value={cls}
          onChange={(e) => setCls(e.target.value)}
          className="rounded-md border border-line bg-background px-3 py-2 text-sm text-ink"
        >
          <option value="all">All classes</option>
          {classes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              {["Student", "Class", "Roll", "Guardian phone", "Fees", ""].map(
                (h) => (
                  <th key={h} className="px-4 py-2 font-normal">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.studentId}
                className="border-b border-line last:border-0 hover:bg-background"
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">{fullName(s)}</p>
                  <p className="text-xs text-muted">{s.studentId}</p>
                </td>
                <td className="px-4 py-3 text-ink">
                  {s.academicRecord.class} – {s.academicRecord.section}
                </td>
                <td className="px-4 py-3 text-ink">
                  {s.academicRecord.rollNumber}
                </td>
                <td className="px-4 py-3 text-ink">
                  {s.guardianDetails.smsNotificationPhone}
                </td>
                <td className="px-4 py-3">
                  {s.financialLedger.dueBalanceNpr > 0 ? (
                    <span className="rounded-full bg-amber/30 px-2 py-0.5 text-xs text-ink">
                      Due{" "}
                      {s.financialLedger.dueBalanceNpr.toLocaleString("en-IN")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-mint px-2 py-0.5 text-xs text-teal">
                      Paid
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={studentHref(s.studentId)}
                    className="text-teal hover:underline"
                  >
                    Open profile
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No students match. Clear the search or pick another class.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
