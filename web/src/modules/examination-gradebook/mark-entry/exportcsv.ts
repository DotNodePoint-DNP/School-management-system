import type { MarkScheme, MarkSheet, ParsedMark, Student } from "../types";
import { getResult, parseRow, percent } from "./gradingUtils";

const esc = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const mark = (p: ParsedMark | null) => (!p ? null : p.status === "absent" ? "AB" : p.score);

/** Excel-friendly CSV (UTF-8 BOM) of the current sheet. */
export function downloadMarksCsv(opts: { students: Student[]; sheet: MarkSheet; scheme: MarkScheme; filename: string }) {
  const { students, sheet, scheme, filename } = opts;
  const head = ["Roll", "Student", "Theory", ...(scheme.hasPractical ? ["Practical", "Total"] : []), "Percent", "Grade", "Status"];
  const rows = students.map((s) => {
    const r = parseRow(sheet[s.id], scheme);
    const res = getResult(r, scheme);
    return [
      s.rollNo, s.name, mark(r.theory),
      ...(scheme.hasPractical ? [mark(r.practical), r.total] : []),
      r.total === null ? null : Math.round(percent(r.total, scheme.totalMax) * 10) / 10,
      res?.label ?? null,
      res ? (res.pass ? "Pass" : "Fail") : r.status === "absent" ? "Absent" : "Incomplete",
    ];
  });
  const csv = [head, ...rows].map((row) => row.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}