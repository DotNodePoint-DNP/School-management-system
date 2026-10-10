"use client";

import React, { useState } from "react";

// --- TYPES ---
export interface SectionConfig {
  id: string;
  name: string; // Dynamic: e.g. "A", "B", "Rose", "Morning"
  capacity: number;
  roomNumber?: string;
}

export interface GradeConfig {
  id: string;
  name: string; // e.g. "Nursery", "Grade 10"
  category: "Pre-Primary" | "Primary" | "Lower Secondary" | "Secondary" | "Higher Secondary";
  stream?: string; // Optional for Grades 11-12
  sections: SectionConfig[];
}

// --- INITIAL DEFAULT TEMPLATES ---
const DEFAULT_GRADES: GradeConfig[] = [
  { id: "g-nursery", name: "Nursery", category: "Pre-Primary", sections: [{ id: "s-n1", name: "A", capacity: 25 }, { id: "s-n2", name: "B", capacity: 25 }] },
  { id: "g-lkg", name: "LKG", category: "Pre-Primary", sections: [{ id: "s-l1", name: "A", capacity: 25 }, { id: "s-l2", name: "B", capacity: 25 }] },
  { id: "g-ukg", name: "UKG", category: "Pre-Primary", sections: [{ id: "s-u1", name: "A", capacity: 30 }, { id: "s-u2", name: "B", capacity: 30 }] },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `g-grade-${i + 1}`,
    name: `Grade ${i + 1}`,
    category: (i + 1 <= 5 ? "Primary" : i + 1 <= 8 ? "Lower Secondary" : "Secondary") as GradeConfig["category"],
    sections: [
      { id: `s-g${i + 1}-a`, name: "A", capacity: 40 },
      { id: `s-g${i + 1}-b`, name: "B", capacity: 40 },
    ],
  })),
  {
    id: "g-grade-11-sci",
    name: "Grade 11",
    category: "Higher Secondary",
    stream: "Science",
    sections: [{ id: "s-g11s-a", name: "A", capacity: 45 }],
  },
  {
    id: "g-grade-11-mgmt",
    name: "Grade 11",
    category: "Higher Secondary",
    stream: "Management",
    sections: [{ id: "s-g11m-a", name: "A", capacity: 50 }],
  },
  {
    id: "g-grade-12-sci",
    name: "Grade 12",
    category: "Higher Secondary",
    stream: "Science",
    sections: [{ id: "s-g12s-a", name: "A", capacity: 45 }],
  },
  {
    id: "g-grade-12-mgmt",
    name: "Grade 12",
    category: "Higher Secondary",
    stream: "Management",
    sections: [{ id: "s-g12m-a", name: "A", capacity: 50 }],
  },
];

export default function ClassSectionManager() {
  const [grades, setGrades] = useState<GradeConfig[]>(DEFAULT_GRADES);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [globalDefaultCap, setGlobalDefaultCap] = useState<number>(40);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const categories = ["All", "Pre-Primary", "Primary", "Lower Secondary", "Secondary", "Higher Secondary"];
  const filteredGrades = selectedCategory === "All" ? grades : grades.filter((g) => g.category === selectedCategory);

  const totalCapacity = grades.reduce(
    (acc, g) => acc + g.sections.reduce((sAcc, s) => sAcc + s.capacity, 0),
    0
  );
  const totalSections = grades.reduce((acc, g) => acc + g.sections.length, 0);

  // --- HANDLERS ---
  
  // Dynamic Section Name Editing
  const handleSectionNameChange = (gradeId: string, sectionId: string, newName: string) => {
    setGrades((prev) =>
      prev.map((g) => {
        if (g.id !== gradeId) return g;
        return {
          ...g,
          sections: g.sections.map((s) => (s.id === sectionId ? { ...s, name: newName } : s)),
        };
      })
    );
  };

  // Capacity Editing
  const handleCapacityChange = (gradeId: string, sectionId: string, newCapacity: number) => {
    setGrades((prev) =>
      prev.map((g) => {
        if (g.id !== gradeId) return g;
        return {
          ...g,
          sections: g.sections.map((s) => (s.id === sectionId ? { ...s, capacity: Math.max(1, newCapacity) } : s)),
        };
      })
    );
  };

  // Add Section with Default Sequential Character (A, B, C...)
  const handleAddSection = (gradeId: string) => {
    setGrades((prev) =>
      prev.map((g) => {
        if (g.id !== gradeId) return g;
        
        // Auto-generate next character default name
        const defaultCharName = String.fromCharCode(65 + g.sections.length); // A, B, C...
        const newSection: SectionConfig = {
          id: `s-${gradeId}-${Date.now()}`,
          name: defaultCharName,
          capacity: globalDefaultCap,
        };
        return { ...g, sections: [...g.sections, newSection] };
      })
    );
  };

  const handleRemoveSection = (gradeId: string, sectionId: string) => {
    setGrades((prev) =>
      prev.map((g) => {
        if (g.id !== gradeId) return g;
        return { ...g, sections: g.sections.filter((s) => s.id !== sectionId) };
      })
    );
  };

  const handleApplyGlobalCapacity = () => {
    setGrades((prev) =>
      prev.map((g) => ({
        ...g,
        sections: g.sections.map((s) => ({ ...s, capacity: globalDefaultCap })),
      }))
    );
  };

  const handleSaveConfiguration = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
    console.log("Saved Structure:", JSON.stringify(grades, null, 2));
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Class & Section Structure</h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Define academic grades, dynamic section names (A/B/C or custom names), and maximum student intake capacities.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isSaved && (
            <span className="text-xs font-bold text-teal animate-pulse">
              ✓ Configuration Saved
            </span>
          )}
          <button
            onClick={handleSaveConfiguration}
            className="rounded-lg bg-teal px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-navy focus:outline-none focus:ring-2 focus:ring-teal"
          >
            Save Structure
          </button>
        </div>
      </div>

      {/* Analytics KPI Dashboard */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-panel p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Total Active Classes</span>
          <p className="mt-1 text-2xl font-black text-navy">{grades.length}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Total Sections Configured</span>
          <p className="mt-1 text-2xl font-black text-navy">{totalSections}</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4 shadow-xs">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Total Student Intake Capacity</span>
          <p className="mt-1 text-2xl font-black text-teal">{totalCapacity.toLocaleString()} Seats</p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="mt-8 flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 md:flex-row md:items-center md:justify-between">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-all ${
                selectedCategory === cat
                  ? "bg-navy text-panel shadow-xs"
                  : "bg-background text-muted hover:border-navy hover:text-ink"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Global Capacity Override Tool */}
        <div className="flex items-center gap-2 border-t border-line pt-3 md:border-t-0 md:pt-0">
          <span className="text-xs font-bold text-ink whitespace-nowrap">Default Capacity:</span>
          <input
            type="number"
            min="1"
            value={globalDefaultCap}
            onChange={(e) => setGlobalDefaultCap(parseInt(e.target.value) || 0)}
            className="w-16 rounded-md border border-line bg-panel px-2 py-1 text-center text-xs font-bold text-ink focus:border-teal focus:outline-none"
          />
          <button
            onClick={handleApplyGlobalCapacity}
            className="rounded-md border border-line bg-background px-3 py-1 text-xs font-bold text-ink hover:bg-line transition-all"
          >
            Apply to All
          </button>
        </div>
      </div>

      {/* Grade Configurations List */}
      <div className="mt-6 space-y-4">
        {filteredGrades.map((grade) => {
          const gradeTotalCap = grade.sections.reduce((acc, s) => acc + s.capacity, 0);

          return (
            <div
              key={grade.id}
              className="rounded-xl border border-line bg-panel p-5 transition-all hover:border-navy/30 hover:shadow-xs"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                {/* Grade Meta */}
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy/10 text-xs font-black text-navy">
                    {grade.name.replace(/[^0-9]/g, "") || grade.name.substring(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-ink">{grade.name}</h3>
                      {grade.stream && (
                        <span className="rounded bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal">
                          {grade.stream}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-muted">{grade.category}</p>
                  </div>
                </div>

                {/* Section Cards */}
                <div className="flex flex-1 flex-wrap items-center gap-3 md:justify-end">
                  {grade.sections.map((sec) => (
                    <div
                      key={sec.id}
                      className="flex items-center gap-2 rounded-lg border border-line bg-background px-3 py-2 shadow-2xs"
                    >
                      {/* Dynamic Editable Section Name */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Sec:</span>
                        <input
                          type="text"
                          value={sec.name}
                          onChange={(e) =>
                            handleSectionNameChange(grade.id, sec.id, e.target.value)
                          }
                          placeholder="A"
                          className="w-12 rounded border border-line/80 bg-panel px-1.5 py-0.5 text-center text-xs font-black text-navy uppercase focus:border-teal focus:outline-none"
                        />
                      </div>

                      {/* Section Capacity */}
                      <div className="flex items-center gap-1 border-l border-line/60 pl-2">
                        <span className="text-[10px] font-bold text-muted">Cap:</span>
                        <input
                          type="number"
                          min="1"
                          value={sec.capacity}
                          onChange={(e) =>
                            handleCapacityChange(grade.id, sec.id, parseInt(e.target.value) || 0)
                          }
                          className="w-12 rounded border border-line/80 bg-panel px-1 py-0.5 text-center text-xs font-bold text-ink focus:border-teal focus:outline-none"
                        />
                      </div>

                      {/* Remove Section */}
                      {grade.sections.length > 1 && (
                        <button
                          onClick={() => handleRemoveSection(grade.id, sec.id)}
                          className="ml-1 text-muted hover:text-coral transition-colors"
                          title="Delete Section"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add Section Button */}
                  <button
                    onClick={() => handleAddSection(grade.id)}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-line px-3 py-2 text-xs font-bold text-teal hover:border-teal hover:bg-teal/5 transition-all"
                  >
                    + Add Section
                  </button>
                </div>

                {/* Total Class Seat Badge */}
                <div className="border-t border-line/60 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">Total Capacity</span>
                  <span className="text-xs font-black text-ink">{gradeTotalCap} Seats</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}