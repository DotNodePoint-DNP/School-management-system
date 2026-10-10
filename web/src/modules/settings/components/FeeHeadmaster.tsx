"use client";

import React, { useState } from "react";
import { toast } from "sonner";

// --- TYPES ---
export type BillingFrequency =
  | "ONE_TIME"
  | "MONTHLY"
  | "QUARTERLY"
  | "TERM_WISE"
  | "ANNUAL";

export interface LedgerAccount {
  code: string;
  name: string;
  type: "REVENUE" | "LIABILITY" | "ASSET";
}

export interface GradeFeeRate {
  gradeId: string;
  gradeName: string;
  amount: number;
}

export interface FeeHead {
  id: string;
  code: string; // e.g., "FH-DANCE"
  name: string; // e.g., "Dance & Performing Arts Fee"
  category:
    | "Admission"
    | "Tuition"
    | "Examination"
    | "Transport"
    | "Hostel"
    | "Library"
    | "Activities & Clubs"
    | "Miscellaneous";
  frequency: BillingFrequency;
  hasGradeWiseRates: boolean;
  defaultAmount: number;
  gradeRates: GradeFeeRate[];
  isRefundable: boolean;
  ledgerCode: string;
}

// --- STANDARD SCHOOL GRADES ---
const DEFAULT_GRADES = [
  { gradeId: "g-nur", gradeName: "Nursery" },
  { gradeId: "g-lkg", gradeName: "LKG" },
  { gradeId: "g-ukg", gradeName: "UKG" },
  { gradeId: "g-1", gradeName: "Grade 1" },
  { gradeId: "g-2", gradeName: "Grade 2" },
  { gradeId: "g-3", gradeName: "Grade 3" },
  { gradeId: "g-4", gradeName: "Grade 4" },
  { gradeId: "g-5", gradeName: "Grade 5" },
  { gradeId: "g-6", gradeName: "Grade 6" },
  { gradeId: "g-7", gradeName: "Grade 7" },
  { gradeId: "g-8", gradeName: "Grade 8" },
  { gradeId: "g-9", gradeName: "Grade 9" },
  { gradeId: "g-10", gradeName: "Grade 10" },
  { gradeId: "g-11", gradeName: "Grade 11" },
  { gradeId: "g-12", gradeName: "Grade 12" },
];

// --- CHART OF ACCOUNTS (GL LEDGERS) ---
const GL_ACCOUNTS: LedgerAccount[] = [
  { code: "4001", name: "4001 - Admission Fee Revenue", type: "REVENUE" },
  { code: "4002", name: "4002 - Tuition Fee Revenue", type: "REVENUE" },
  { code: "4003", name: "4003 - Examination Fee Revenue", type: "REVENUE" },
  { code: "4004", name: "4004 - Transport Services Income", type: "REVENUE" },
  { code: "4005", name: "4005 - Hostel Accommodation Revenue", type: "REVENUE" },
  { code: "4006", name: "4006 - Library Fees & Fines Income", type: "REVENUE" },
  { code: "4007", name: "4007 - Extracurricular & Club Income", type: "REVENUE" },
  { code: "4099", name: "4099 - Miscellaneous Student Income", type: "REVENUE" },
];

// --- INITIAL FEE HEAD DATA ---
const INITIAL_FEE_HEADS: FeeHead[] = [
  {
    id: "fh-tuit",
    code: "FH-TUIT",
    name: "Monthly Tuition Fee",
    category: "Tuition",
    frequency: "MONTHLY",
    hasGradeWiseRates: true,
    defaultAmount: 4000,
    ledgerCode: "4002",
    isRefundable: false,
    gradeRates: DEFAULT_GRADES.map((g) => ({
      gradeId: g.gradeId,
      gradeName: g.gradeName,
      amount: g.gradeName.includes("11") || g.gradeName.includes("12") ? 5500 : 3500,
    })),
  },
  {
    id: "fh-dance",
    code: "FH-DANCE",
    name: "Dance & Performing Arts",
    category: "Activities & Clubs",
    frequency: "MONTHLY",
    hasGradeWiseRates: false,
    defaultAmount: 1200,
    ledgerCode: "4007",
    isRefundable: false,
    gradeRates: [],
  },
  {
    id: "fh-exam",
    code: "FH-EXAM",
    name: "Term Examination Fee",
    category: "Examination",
    frequency: "TERM_WISE",
    hasGradeWiseRates: true,
    defaultAmount: 1200,
    ledgerCode: "4003",
    isRefundable: false,
    gradeRates: DEFAULT_GRADES.map((g) => ({
      gradeId: g.gradeId,
      gradeName: g.gradeName,
      amount: 1000,
    })),
  },
];

export default function FeeHeadMaster() {
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>(INITIAL_FEE_HEADS);
  const [selectedFeeHeadForRates, setSelectedFeeHeadForRates] = useState<FeeHead | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Fee Head Form State
  const [newFeeHead, setNewFeeHead] = useState<Omit<FeeHead, "id" | "gradeRates">>({
    code: "",
    name: "",
    category: "Activities & Clubs",
    frequency: "MONTHLY",
    hasGradeWiseRates: false,
    defaultAmount: 0,
    isRefundable: false,
    ledgerCode: "4007",
  });

  // --- HANDLERS ---

  // 1. Create New Custom Fee Head
  const handleCreateFeeHead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeeHead.name || !newFeeHead.code) {
      toast.error("Please enter a Fee Name and Code.");
      return;
    }

    const createdHead: FeeHead = {
      ...newFeeHead,
      id: `fh-${Date.now()}`,
      code: newFeeHead.code.toUpperCase().trim(),
      gradeRates: newFeeHead.hasGradeWiseRates
        ? DEFAULT_GRADES.map((g) => ({
            gradeId: g.gradeId,
            gradeName: g.gradeName,
            amount: newFeeHead.defaultAmount,
          }))
        : [],
    };

    setFeeHeads((prev) => [...prev, createdHead]);
    setIsAddModalOpen(false);

    // Reset Form
    setNewFeeHead({
      code: "",
      name: "",
      category: "Activities & Clubs",
      frequency: "MONTHLY",
      hasGradeWiseRates: false,
      defaultAmount: 0,
      isRefundable: false,
      ledgerCode: "4007",
    });

    toast.success(`Fee Head "${createdHead.name}" added successfully!`);
  };

  // 2. Toggle Grade-Wise Differential Rates
  const handleToggleGradeWise = (id: string, enabled: boolean) => {
    setFeeHeads((prev) =>
      prev.map((fh) => {
        if (fh.id !== id) return fh;
        const gradeRates =
          fh.gradeRates.length > 0
            ? fh.gradeRates
            : DEFAULT_GRADES.map((g) => ({
                gradeId: g.gradeId,
                gradeName: g.gradeName,
                amount: fh.defaultAmount,
              }));

        return { ...fh, hasGradeWiseRates: enabled, gradeRates };
      })
    );
  };

  // 3. Update Individual Grade Rate
  const handleUpdateGradeRate = (feeHeadId: string, gradeId: string, amount: number) => {
    setFeeHeads((prev) =>
      prev.map((fh) => {
        if (fh.id !== feeHeadId) return fh;
        return {
          ...fh,
          gradeRates: fh.gradeRates.map((gr) =>
            gr.gradeId === gradeId ? { ...gr, amount } : gr
          ),
        };
      })
    );

    if (selectedFeeHeadForRates?.id === feeHeadId) {
      setSelectedFeeHeadForRates((prev) =>
        prev
          ? {
              ...prev,
              gradeRates: prev.gradeRates.map((gr) =>
                gr.gradeId === gradeId ? { ...gr, amount } : gr
              ),
            }
          : null
      );
    }
  };

  // 4. General Field Changes
  const handleFieldChange = (
    id: string,
    field: keyof FeeHead,
    value: string | number | boolean
  ) => {
    setFeeHeads((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  // 5. Delete Fee Head
  const handleDeleteFeeHead = (id: string, name: string) => {
    setFeeHeads((prev) => prev.filter((f) => f.id !== id));
    toast.info(`Removed "${name}" from Fee Head Master.`);
  };

  // 6. Save State
  const handleSaveAll = () => {
    toast.success("Fee Head Master and Grade Rates saved!");
    console.log("Saved Fee Matrix:", JSON.stringify(feeHeads, null, 2));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Fee Head & Rate Master</h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Manage standard and custom fee heads (Dance, Sports, Extra Activities) with grade-wise monthly rates and ledger mappings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="rounded-lg border border-teal/40 bg-teal/10 px-4 py-2.5 text-xs font-bold text-teal hover:bg-teal hover:text-panel transition-all"
          >
            + Add New Fee Head
          </button>
          <button
            onClick={handleSaveAll}
            className="rounded-lg bg-navy px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-teal focus:outline-none"
          >
            Save Matrix
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-xl border border-line bg-panel shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-background border-b border-line text-[10px] uppercase font-bold text-muted">
              <tr>
                <th className="px-4 py-3">Fee Code & Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Cycle</th>
                <th className="px-4 py-3">Pricing Strategy</th>
                <th className="px-4 py-3">Base Amount (NPR)</th>
                <th className="px-4 py-3">GL Ledger Account</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 font-medium text-ink">
              {feeHeads.map((head) => (
                <tr key={head.id} className="hover:bg-background/50 transition-colors">
                  {/* Code & Name */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="w-fit rounded bg-navy/10 px-1.5 py-0.5 text-[10px] font-black text-navy uppercase">
                        {head.code}
                      </span>
                      <input
                        type="text"
                        value={head.name}
                        onChange={(e) => handleFieldChange(head.id, "name", e.target.value)}
                        className="w-full min-w-[160px] rounded border border-line bg-panel px-2 py-1 font-bold text-ink focus:border-teal focus:outline-none"
                      />
                    </div>
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3 font-semibold text-muted">{head.category}</td>

                  {/* Cycle */}
                  <td className="px-4 py-3">
                    <span className="rounded bg-background px-2 py-1 text-[10px] font-bold text-muted border border-line uppercase">
                      {head.frequency}
                    </span>
                  </td>

                  {/* Pricing Strategy */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleGradeWise(head.id, !head.hasGradeWiseRates)}
                      className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase transition-all ${
                        head.hasGradeWiseRates
                          ? "bg-teal/10 text-teal border border-teal/20"
                          : "bg-background text-muted border border-line"
                      }`}
                    >
                      {head.hasGradeWiseRates ? "Grade-Wise Rates" : "Flat Rate"}
                    </button>
                  </td>

                  {/* Base Amount */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="text-muted font-bold">Rs.</span>
                      <input
                        type="number"
                        min="0"
                        value={head.defaultAmount}
                        onChange={(e) =>
                          handleFieldChange(head.id, "defaultAmount", parseFloat(e.target.value) || 0)
                        }
                        className="w-24 rounded border border-line bg-panel px-2 py-1 font-bold text-teal focus:border-teal focus:outline-none"
                      />
                    </div>
                  </td>

                  {/* GL Account */}
                  <td className="px-4 py-3">
                    <select
                      value={head.ledgerCode}
                      onChange={(e) => handleFieldChange(head.id, "ledgerCode", e.target.value)}
                      className="w-full min-w-[180px] rounded border border-line bg-panel px-2 py-1 text-xs font-bold text-navy focus:border-teal focus:outline-none"
                    >
                      {GL_ACCOUNTS.map((acc) => (
                        <option key={acc.code} value={acc.code}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {head.hasGradeWiseRates && (
                        <button
                          onClick={() => setSelectedFeeHeadForRates(head)}
                          className="rounded-lg bg-navy px-3 py-1.5 text-[10px] font-bold text-panel hover:bg-teal transition-all"
                        >
                          Grade Rates
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteFeeHead(head.id, head.name)}
                        className="text-muted hover:text-coral transition-colors font-bold text-xs"
                        title="Delete Fee Head"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD NEW CUSTOM FEE HEAD */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6 shadow-xl">
            <h3 className="text-base font-bold text-ink">Add Custom Fee Head</h3>
            <p className="mt-1 text-xs text-muted">
              Create new fee heads like Dance Fee, Karate, Robotics Club, or Special Exams.
            </p>

            <form onSubmit={handleCreateFeeHead} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-ink">Fee Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FH-DANCE"
                    value={newFeeHead.code}
                    onChange={(e) => setNewFeeHead({ ...newFeeHead, code: e.target.value })}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink uppercase focus:border-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-ink">Category</label>
                  <select
                    value={newFeeHead.category}
                    onChange={(e) =>
                      setNewFeeHead({
                        ...newFeeHead,
                        category: e.target.value as FeeHead["category"],
                      })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  >
                    <option value="Activities & Clubs">Activities & Clubs</option>
                    <option value="Tuition">Tuition</option>
                    <option value="Admission">Admission</option>
                    <option value="Examination">Examination</option>
                    <option value="Transport">Transport</option>
                    <option value="Hostel">Hostel</option>
                    <option value="Library">Library</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-ink">Fee Head Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dance & Performing Arts Class"
                  value={newFeeHead.name}
                  onChange={(e) => setNewFeeHead({ ...newFeeHead, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-ink">Billing Frequency</label>
                  <select
                    value={newFeeHead.frequency}
                    onChange={(e) =>
                      setNewFeeHead({
                        ...newFeeHead,
                        frequency: e.target.value as BillingFrequency,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ONE_TIME">One Time</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="TERM_WISE">Term Wise</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-ink">Default Rate (NPR)</label>
                  <input
                    type="number"
                    min="0"
                    value={newFeeHead.defaultAmount}
                    onChange={(e) =>
                      setNewFeeHead({
                        ...newFeeHead,
                        defaultAmount: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-ink">Accounting GL Ledger</label>
                <select
                  value={newFeeHead.ledgerCode}
                  onChange={(e) => setNewFeeHead({ ...newFeeHead, ledgerCode: e.target.value })}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none font-bold"
                >
                  {GL_ACCOUNTS.map((acc) => (
                    <option key={acc.code} value={acc.code}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="gradeWiseCheck"
                  checked={newFeeHead.hasGradeWiseRates}
                  onChange={(e) =>
                    setNewFeeHead({ ...newFeeHead, hasGradeWiseRates: e.target.checked })
                  }
                  className="rounded border-line text-teal focus:ring-teal"
                />
                <label htmlFor="gradeWiseCheck" className="text-xs font-bold text-ink">
                  Enable distinct rate per grade level
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-md border border-line px-4 py-2 font-bold text-muted hover:bg-background"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-teal px-4 py-2 font-bold text-panel hover:bg-navy"
                >
                  Create Fee Head
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: GRADE-WISE RATES MATRIX */}
      {selectedFeeHeadForRates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-xl border border-line bg-panel p-6 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">
                  Grade Monthly Rates: {selectedFeeHeadForRates.name}
                </h3>
                <p className="text-xs text-muted">
                  Specify distinct rates per grade. Monthly billing generation will use these custom rates.
                </p>
              </div>
              <button
                onClick={() => setSelectedFeeHeadForRates(null)}
                className="text-muted hover:text-coral font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 overflow-y-auto space-y-2 pr-1 flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {selectedFeeHeadForRates.gradeRates.map((gr) => (
                  <div
                    key={gr.gradeId}
                    className="rounded-lg border border-line bg-background p-3 flex flex-col justify-between"
                  >
                    <span className="text-xs font-bold text-ink">{gr.gradeName}</span>
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-xs text-muted font-bold">Rs.</span>
                      <input
                        type="number"
                        min="0"
                        value={gr.amount}
                        onChange={(e) =>
                          handleUpdateGradeRate(
                            selectedFeeHeadForRates.id,
                            gr.gradeId,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full rounded border border-line bg-panel px-2 py-1 text-xs font-bold text-teal focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between pt-4 border-t border-line">
              <p className="text-[11px] text-muted font-medium">
                Tip: Changes apply immediately in local state.
              </p>
              <button
                onClick={() => setSelectedFeeHeadForRates(null)}
                className="rounded-lg bg-navy px-5 py-2 text-xs font-bold text-panel hover:bg-teal transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}