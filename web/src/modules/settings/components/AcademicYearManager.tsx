"use client";

import React, { useState } from "react";
import { toast } from "sonner";

// --- TYPES ---
export type AcademicYearStatus = "UPCOMING" | "CURRENT" | "LOCKED" | "CLOSED";

export interface PromotionRule {
  gradeFrom: string;
  gradeTo: string;
  minAttendancePercent: number;
  minPassGpa: number;
  autoPromote: boolean;
}

export interface AcademicYear {
  id: string;
  name: string; // e.g. "2081/82"
  startDate: string;
  endDate: string;
  status: AcademicYearStatus;
  promotionRules: PromotionRule[];
}

// --- INITIAL DEFAULT ACADEMIC YEARS ---
const INITIAL_YEARS: AcademicYear[] = [
  {
    id: "ay-2080-81",
    name: "2080/81",
    startDate: "2080-01-01",
    endDate: "2080-12-30",
    status: "CLOSED",
    promotionRules: [],
  },
  {
    id: "ay-2081-82",
    name: "2081/82",
    startDate: "2081-01-01",
    endDate: "2081-12-30",
    status: "CURRENT",
    promotionRules: [
      { gradeFrom: "Nursery", gradeTo: "LKG", minAttendancePercent: 75, minPassGpa: 1.6, autoPromote: true },
      { gradeFrom: "Grade 9", gradeTo: "Grade 10", minAttendancePercent: 80, minPassGpa: 2.0, autoPromote: true },
      { gradeFrom: "Grade 10", gradeTo: "Graduated / Grade 11", minAttendancePercent: 80, minPassGpa: 2.0, autoPromote: false },
    ],
  },
  {
    id: "ay-2082-83",
    name: "2082/83",
    startDate: "2082-01-01",
    endDate: "2082-12-30",
    status: "UPCOMING",
    promotionRules: [],
  },
];

export default function AcademicYearManager() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>(INITIAL_YEARS);
  const [selectedYearId, setSelectedYearId] = useState<string>("ay-2081-82");
  const [isCreatingModalOpen, setIsCreatingModalOpen] = useState(false);

  // Form states for creating a new Academic Year
  const [newYearName, setNewYearName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");

  const selectedYear = academicYears.find((y) => y.id === selectedYearId) || academicYears[0];

  // --- HANDLERS ---

  // 1. Set Active / Current Academic Year
  const handleSetCurrentYear = (yearId: string) => {
    const targetYear = academicYears.find((y) => y.id === yearId);
    if (!targetYear) return;

    if (targetYear.status === "CLOSED") {
      toast.error("Cannot activate a closed academic year.");
      return;
    }

    setAcademicYears((prev) =>
      prev.map((y) => {
        if (y.id === yearId) return { ...y, status: "CURRENT" };
        if (y.status === "CURRENT") return { ...y, status: "LOCKED" }; // Lock previous active year
        return y;
      })
    );

    toast.success(`Academic Year ${targetYear.name} is now set as CURRENT.`);
  };

  // 2. Lock Academic Year (prevents further grade updates or fee changes)
  const handleLockYear = (yearId: string) => {
    const target = academicYears.find((y) => y.id === yearId);
    if (!target) return;

    setAcademicYears((prev) =>
      prev.map((y) => (y.id === yearId ? { ...y, status: "LOCKED" } : y))
    );

    toast.warning(`Academic Year ${target.name} has been LOCKED.`, {
      description: "Data entry and modifications are now restricted to Read-Only.",
    });
  };

  // 3. Close Academic Year & Execute Carry Forward / Student Auto Promotion
  const handleCloseAndPromote = (yearId: string) => {
    const target = academicYears.find((y) => y.id === yearId);
    if (!target) return;

    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1200)),
      {
        loading: `Running auto-promotion algorithms and closing ${target.name}...`,
        success: () => {
          setAcademicYears((prev) =>
            prev.map((y) => (y.id === yearId ? { ...y, status: "CLOSED" } : y))
          );
          return `Academic Year ${target.name} officially CLOSED. Eligible students promoted to next session.`;
        },
        error: "Failed to close academic year.",
      }
    );
  };

  // 4. Create New Academic Year
  const handleCreateYear = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearName.trim()) {
      toast.error("Please enter a valid session name (e.g. 2083/84).");
      return;
    }

    const newYear: AcademicYear = {
      id: `ay-${Date.now()}`,
      name: newYearName,
      startDate: newStartDate || "2083-01-01",
      endDate: newEndDate || "2083-12-30",
      status: "UPCOMING",
      promotionRules: [
        { gradeFrom: "Nursery", gradeTo: "LKG", minAttendancePercent: 75, minPassGpa: 1.6, autoPromote: true },
        { gradeFrom: "Primary (1-5)", gradeTo: "Next Grade", minAttendancePercent: 75, minPassGpa: 1.6, autoPromote: true },
      ],
    };

    setAcademicYears((prev) => [...prev, newYear]);
    setSelectedYearId(newYear.id);
    setIsCreatingModalOpen(false);
    setNewYearName("");

    toast.success(`Academic Year ${newYear.name} created!`);
  };

  // 5. Toggle Rule Auto-Promotion
  const handleToggleAutoPromote = (ruleIndex: number) => {
    if (selectedYear.status === "CLOSED" || selectedYear.status === "LOCKED") {
      toast.error("Cannot modify rules on locked or closed academic years.");
      return;
    }

    setAcademicYears((prev) =>
      prev.map((y) => {
        if (y.id !== selectedYear.id) return y;
        const updatedRules = [...y.promotionRules];
        updatedRules[ruleIndex].autoPromote = !updatedRules[ruleIndex].autoPromote;
        return { ...y, promotionRules: updatedRules };
      })
    );

    toast.info("Carry-forward promotion rule updated.");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Academic Session Manager</h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Provision academic years, lock historical data, set active sessions, and configure student auto-promotion rules.
          </p>
        </div>

        <button
          onClick={() => setIsCreatingModalOpen(true)}
          className="rounded-lg bg-teal px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-navy focus:outline-none focus:ring-2 focus:ring-teal"
        >
          + New Academic Session
        </button>
      </div>

      {/* Session Cards Horizontal List */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {academicYears.map((ay) => {
          const isSelected = ay.id === selectedYear.id;

          return (
            <div
              key={ay.id}
              onClick={() => setSelectedYearId(ay.id)}
              className={`cursor-pointer rounded-xl border p-5 transition-all ${
                isSelected
                  ? "border-teal bg-teal/5 shadow-xs ring-1 ring-teal"
                  : "border-line bg-panel hover:border-navy/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-black text-navy">Session {ay.name}</span>

                {/* Status Badges */}
                {ay.status === "CURRENT" && (
                  <span className="rounded bg-teal px-2 py-0.5 text-[10px] font-bold uppercase text-panel animate-pulse">
                    Current Active
                  </span>
                )}
                {ay.status === "UPCOMING" && (
                  <span className="rounded bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase text-navy">
                    Upcoming
                  </span>
                )}
                {ay.status === "LOCKED" && (
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                    Locked (Read-Only)
                  </span>
                )}
                {ay.status === "CLOSED" && (
                  <span className="rounded bg-coral/10 px-2 py-0.5 text-[10px] font-bold uppercase text-coral">
                    Archived / Closed
                  </span>
                )}
              </div>

              <div className="mt-3 text-xs text-muted">
                <p>Start: <span className="font-semibold text-ink">{ay.startDate}</span></p>
                <p>End: <span className="font-semibold text-ink">{ay.endDate}</span></p>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3" onClick={(e) => e.stopPropagation()}>
                {ay.status !== "CURRENT" && ay.status !== "CLOSED" && (
                  <button
                    onClick={() => handleSetCurrentYear(ay.id)}
                    className="text-[11px] font-bold text-teal hover:underline"
                  >
                    Set Active
                  </button>
                )}

                {ay.status === "CURRENT" && (
                  <button
                    onClick={() => handleLockYear(ay.id)}
                    className="text-[11px] font-bold text-amber-600 hover:underline"
                  >
                    Lock Session
                  </button>
                )}

                {ay.status !== "CLOSED" && (
                  <button
                    onClick={() => handleCloseAndPromote(ay.id)}
                    className="text-[11px] font-bold text-coral hover:underline"
                  >
                    Close & Auto-Promote
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Promotion Rules Configuration Section */}
      <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-base font-bold text-ink">
              Carry-Forward & Student Promotion Rules ({selectedYear.name})
            </h2>
            <p className="text-xs text-muted">
              Define auto-advancement benchmarks when transitioning students from {selectedYear.name} to the next academic cycle.
            </p>
          </div>

          <span className="rounded border border-line bg-background px-3 py-1 text-xs font-bold text-ink">
            Status: {selectedYear.status}
          </span>
        </div>

        {/* Promotion Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background border-b border-line text-[10px] uppercase font-bold text-muted">
              <tr>
                <th className="px-4 py-3">Source Grade</th>
                <th className="px-4 py-3">Destination Grade</th>
                <th className="px-4 py-3">Min GPA Requirement</th>
                <th className="px-4 py-3">Min Attendance %</th>
                <th className="px-4 py-3">Auto-Promote On Session Close</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-medium text-ink">
              {selectedYear.promotionRules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-xs text-muted">
                    No custom promotion rules configured for this session yet. Standard system defaults apply.
                  </td>
                </tr>
              ) : (
                selectedYear.promotionRules.map((rule, idx) => (
                  <tr key={idx} className="hover:bg-background/50">
                    <td className="px-4 py-3 font-bold text-navy">{rule.gradeFrom}</td>
                    <td className="px-4 py-3 font-bold text-teal">→ {rule.gradeTo}</td>
                    <td className="px-4 py-3">{rule.minPassGpa} GPA</td>
                    <td className="px-4 py-3">{rule.minAttendancePercent}%</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleAutoPromote(idx)}
                        disabled={selectedYear.status === "CLOSED" || selectedYear.status === "LOCKED"}
                        className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${
                          rule.autoPromote
                            ? "bg-teal/10 text-teal border border-teal/20"
                            : "bg-background text-muted border border-line"
                        }`}
                      >
                        {rule.autoPromote ? "✓ Auto-Promote" : "Manual Approval Required"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE NEW ACADEMIC YEAR MODAL */}
      {isCreatingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6 shadow-xl">
            <h3 className="text-base font-bold text-ink">Create New Academic Session</h3>
            <p className="mt-1 text-xs text-muted">Initialize a new academic calendar for your school.</p>

            <form onSubmit={handleCreateYear} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-ink">Session Name (e.g., 2083/84)</label>
                <input
                  type="text"
                  required
                  placeholder="2083/84"
                  value={newYearName}
                  onChange={(e) => setNewYearName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-ink">Start Date (BS/AD)</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink">End Date (BS/AD)</label>
                  <input
                    type="date"
                    value={newEndDate}
                    onChange={(e) => setNewEndDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsCreatingModalOpen(false)}
                  className="rounded-md border border-line px-4 py-2 font-bold text-muted hover:bg-background"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-teal px-4 py-2 font-bold text-panel hover:bg-navy"
                >
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}