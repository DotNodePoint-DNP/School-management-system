"use client";

import React, { useState } from "react";
import { toast } from "sonner";

// --- TYPES ---
export interface GradeBand {
  id: string;
  letterGrade: string; // e.g. "A+", "A", "B+"
  gpaPoint: number; // e.g. 4.0, 3.6, 3.2
  minPercentage: number; // e.g. 90
  maxPercentage: number; // e.g. 100
  remark: string; // e.g. "Outstanding", "Excellent"
  isPassingGrade: boolean;
}

export interface ClassGroupGradingScheme {
  id: string;
  groupName: string; // e.g. "Secondary & Higher Secondary (9-12)"
  description: string;
  bands: GradeBand[];
}

// --- INITIAL DEFAULT SCHEMES (Standard Nepalese / International Matrix) ---
const INITIAL_SCHEMES: ClassGroupGradingScheme[] = [
  {
    id: "scheme-sec",
    groupName: "Secondary & Higher Secondary (Grades 9 - 12)",
    description: "Standard 4.0 GPA Letter Grading System with explicit passing thresholds",
    bands: [
      { id: "b1", letterGrade: "A+", gpaPoint: 4.0, minPercentage: 90, maxPercentage: 100, remark: "Outstanding", isPassingGrade: true },
      { id: "b2", letterGrade: "A", gpaPoint: 3.6, minPercentage: 80, maxPercentage: 89, remark: "Excellent", isPassingGrade: true },
      { id: "b3", letterGrade: "B+", gpaPoint: 3.2, minPercentage: 70, maxPercentage: 79, remark: "Very Good", isPassingGrade: true },
      { id: "b4", letterGrade: "B", gpaPoint: 2.8, minPercentage: 60, maxPercentage: 69, remark: "Good", isPassingGrade: true },
      { id: "b5", letterGrade: "C+", gpaPoint: 2.4, minPercentage: 50, maxPercentage: 59, remark: "Satisfactory", isPassingGrade: true },
      { id: "b6", letterGrade: "C", gpaPoint: 2.0, minPercentage: 40, maxPercentage: 49, remark: "Acceptable", isPassingGrade: true },
      { id: "b7", letterGrade: "D", gpaPoint: 1.6, minPercentage: 35, maxPercentage: 39, remark: "Basic", isPassingGrade: true },
      { id: "b8", letterGrade: "NG", gpaPoint: 0.0, minPercentage: 0, maxPercentage: 34, remark: "Not Graded (Ungraded)", isPassingGrade: false },
    ],
  },
  {
    id: "scheme-pri",
    groupName: "Primary & Lower Secondary (Grades 1 - 8)",
    description: "Competency and Performance-based descriptive continuous grading",
    bands: [
      { id: "bp1", letterGrade: "A+", gpaPoint: 4.0, minPercentage: 90, maxPercentage: 100, remark: "Advanced Competency", isPassingGrade: true },
      { id: "bp2", letterGrade: "A", gpaPoint: 3.6, minPercentage: 75, maxPercentage: 89, remark: "Proficient", isPassingGrade: true },
      { id: "bp3", letterGrade: "B", gpaPoint: 2.8, minPercentage: 50, maxPercentage: 74, remark: "Developing", isPassingGrade: true },
      { id: "bp4", letterGrade: "C", gpaPoint: 2.0, minPercentage: 0, maxPercentage: 49, remark: "Needs Support", isPassingGrade: true },
    ],
  },
  {
    id: "scheme-prep",
    groupName: "Pre-Primary (Nursery, LKG, UKG)",
    description: "Non-numeric qualitative evaluation benchmarks",
    bands: [
      { id: "bpre1", letterGrade: "E", gpaPoint: 4.0, minPercentage: 85, maxPercentage: 100, remark: "Exceeds Expectations", isPassingGrade: true },
      { id: "bpre2", letterGrade: "M", gpaPoint: 3.0, minPercentage: 60, maxPercentage: 84, remark: "Meets Expectations", isPassingGrade: true },
      { id: "bpre3", letterGrade: "P", gpaPoint: 2.0, minPercentage: 0, maxPercentage: 59, remark: "Progressing", isPassingGrade: true },
    ],
  },
];

export default function GradingScaleBuilder() {
  const [schemes, setSchemes] = useState<ClassGroupGradingScheme[]>(INITIAL_SCHEMES);
  const [activeSchemeId, setActiveSchemeId] = useState<string>("scheme-sec");
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const activeScheme = schemes.find((s) => s.id === activeSchemeId) || schemes[0];

  // --- HANDLERS ---

  // 1. Update Specific Grade Band Input
  const handleBandChange = (
    bandId: string,
    field: keyof GradeBand,
    value: string | number | boolean
  ) => {
    setSchemes((prev) =>
      prev.map((s) => {
        if (s.id !== activeSchemeId) return s;
        return {
          ...s,
          bands: s.bands.map((b) => (b.id === bandId ? { ...b, [field]: value } : b)),
        };
      })
    );
  };

  // 2. Add New Grade Band to Current Class Group
  const handleAddBand = () => {
    const newBand: GradeBand = {
      id: `b-${Date.now()}`,
      letterGrade: "NEW",
      gpaPoint: 1.0,
      minPercentage: 0,
      maxPercentage: 20,
      remark: "Needs Improvement",
      isPassingGrade: true,
    };

    setSchemes((prev) =>
      prev.map((s) => {
        if (s.id !== activeSchemeId) return s;
        return { ...s, bands: [...s.bands, newBand] };
      })
    );

    toast.info("New grade band appended. Please adjust boundary range percentages.");
  };

  // 3. Delete Grade Band
  const handleRemoveBand = (bandId: string) => {
    if (activeScheme.bands.length <= 2) {
      toast.error("A grading scale must maintain at least two grade bands.");
      return;
    }

    setSchemes((prev) =>
      prev.map((s) => {
        if (s.id !== activeSchemeId) return s;
        return { ...s, bands: s.bands.filter((b) => b.id !== bandId) };
      })
    );

    toast.success("Grade band removed.");
  };

  // 4. Save & Validate Scheme Overlaps
  const handleSaveSchemes = () => {
    // Basic Boundary Overlap Checks
    let hasOverlap = false;
    const sortedBands = [...activeScheme.bands].sort((a, b) => b.minPercentage - a.minPercentage);

    for (let i = 0; i < sortedBands.length - 1; i++) {
      if (sortedBands[i].minPercentage <= sortedBands[i + 1].maxPercentage) {
        hasOverlap = true;
        break;
      }
    }

    if (hasOverlap) {
      toast.warning("Boundary Warning: Potential percentage overlap detected between bands.", {
        description: "Ensure min/max bounds are contiguous (e.g. 80-89 and 90-100).",
      });
    }

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);

    toast.success(`Grading scale saved for ${activeScheme.groupName}`, {
      description: "Applied to term examination progress reports and report cards.",
    });

    console.log("Saved Grading Configuration:", JSON.stringify(schemes, null, 2));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Grading Scale Builder</h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Configure letter grade boundaries, GPA values, percentage ranges, and remarks per academic class group.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isSaved && (
            <span className="text-xs font-bold text-teal animate-pulse">
              ✓ Matrix Synchronized
            </span>
          )}
          <button
            onClick={handleSaveSchemes}
            className="rounded-lg bg-teal px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-navy focus:outline-none focus:ring-2 focus:ring-teal"
          >
            Save Grading Scale
          </button>
        </div>
      </div>

      {/* Class Group Selectors */}
      <div className="flex flex-wrap gap-2">
        {schemes.map((s) => {
          const isActive = s.id === activeSchemeId;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSchemeId(s.id)}
              className={`rounded-xl border px-4 py-3 text-left transition-all ${
                isActive
                  ? "border-teal bg-teal/5 text-ink shadow-2xs ring-1 ring-teal"
                  : "border-line bg-panel text-muted hover:border-navy/40 hover:text-ink"
              }`}
            >
              <p className="text-xs font-bold">{s.groupName}</p>
              <p className="mt-0.5 text-[10px] opacity-80">{s.bands.length} Grade Bands defined</p>
            </button>
          );
        })}
      </div>

      {/* Main Grading Matrix Editor */}
      <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-ink">{activeScheme.groupName}</h2>
            <p className="text-xs text-muted">{activeScheme.description}</p>
          </div>

          <button
            onClick={handleAddBand}
            className="rounded-lg border border-dashed border-teal bg-teal/5 px-3 py-1.5 text-xs font-bold text-teal hover:bg-teal/10 transition-all"
          >
            + Add Grade Band
          </button>
        </div>

        {/* Bands Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background border-b border-line text-[10px] uppercase font-bold text-muted">
              <tr>
                <th className="px-4 py-3">Grade Letter</th>
                <th className="px-4 py-3">GPA Value</th>
                <th className="px-4 py-3">Min %</th>
                <th className="px-4 py-3">Max %</th>
                <th className="px-4 py-3">Remarks / Description</th>
                <th className="px-4 py-3">Passing Grade</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-medium text-ink">
              {activeScheme.bands.map((band) => (
                <tr key={band.id} className="hover:bg-background/50 transition-colors">
                  {/* Letter Grade */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={band.letterGrade}
                      onChange={(e) => handleBandChange(band.id, "letterGrade", e.target.value)}
                      className="w-16 rounded border border-line bg-panel px-2 py-1 text-center font-black text-navy uppercase focus:border-teal focus:outline-none"
                    />
                  </td>

                  {/* GPA Point */}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="4.0"
                      value={band.gpaPoint}
                      onChange={(e) => handleBandChange(band.id, "gpaPoint", parseFloat(e.target.value) || 0)}
                      className="w-16 rounded border border-line bg-panel px-2 py-1 text-center font-bold text-ink focus:border-teal focus:outline-none"
                    />
                  </td>

                  {/* Min % */}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={band.minPercentage}
                      onChange={(e) => handleBandChange(band.id, "minPercentage", parseInt(e.target.value) || 0)}
                      className="w-16 rounded border border-line bg-panel px-2 py-1 text-center font-bold text-teal focus:border-teal focus:outline-none"
                    />
                    <span className="ml-1 text-muted">%</span>
                  </td>

                  {/* Max % */}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={band.maxPercentage}
                      onChange={(e) => handleBandChange(band.id, "maxPercentage", parseInt(e.target.value) || 0)}
                      className="w-16 rounded border border-line bg-panel px-2 py-1 text-center font-bold text-teal focus:border-teal focus:outline-none"
                    />
                    <span className="ml-1 text-muted">%</span>
                  </td>

                  {/* Remark */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={band.remark}
                      onChange={(e) => handleBandChange(band.id, "remark", e.target.value)}
                      className="w-full min-w-[140px] rounded border border-line bg-panel px-2.5 py-1 font-medium text-ink focus:border-teal focus:outline-none"
                    />
                  </td>

                  {/* Pass / Fail Toggle */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleBandChange(band.id, "isPassingGrade", !band.isPassingGrade)}
                      className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${
                        band.isPassingGrade
                          ? "bg-teal/10 text-teal border border-teal/20"
                          : "bg-coral/10 text-coral border border-coral/20"
                      }`}
                    >
                      {band.isPassingGrade ? "Pass" : "Fail / NG"}
                    </button>
                  </td>

                  {/* Delete */}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemoveBand(band.id)}
                      className="text-muted hover:text-coral transition-colors font-bold"
                      title="Remove Grade Band"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}