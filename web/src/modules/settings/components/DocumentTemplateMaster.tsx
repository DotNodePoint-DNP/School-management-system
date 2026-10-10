"use client";

import React, { useState } from "react";
import { toast } from "sonner";

// --- TYPES ---
export type DocumentCategory =
  | "INVOICE"
  | "CERTIFICATE"
  | "OFFICIAL_LETTER"
  | "ID_CARD";

export interface SignatureBlock {
  title: string; // e.g., "Principal", "Accountant"
  name: string; // e.g., "Dr. K. P. Sharma"
  showSignatureImage: boolean;
  signatureImageUrl?: string;
}

export interface HeaderFooterLayout {
  schoolName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  primaryColor: string; // e.g. hex #005f73
  secondaryColor: string;
  footerNotice: string;
  affiliationText: string; // e.g. "Govt. Regd. No: 12345/078 | Affiliated to NEB"
}

export interface DocumentTemplate {
  id: string;
  code: string;
  title: string;
  category: DocumentCategory;
  layoutConfig: HeaderFooterLayout;
  signatures: SignatureBlock[];
  customCSS?: string;
  isDefault: boolean;
}

// --- INITIAL DEFAULT SAMPLE DATA ---
const DEFAULT_LAYOUT: HeaderFooterLayout = {
  schoolName: "Mayura International School",
  tagline: "Excellence in Education & Character Building",
  address: "Birtamode-5, Jhapa, Koshi Province, Nepal",
  phone: "+977-23-540000 | +977-9800000000",
  email: "info@mayura.edu.np",
  website: "www.mayura.edu.np",
  logoUrl: "https://mayuraerp.com/logo.png",
  primaryColor: "#0f172a",
  secondaryColor: "#0d9488",
  footerNotice: "This is a computer-generated document. Serial verified via QR Code.",
  affiliationText: "Regd No: 48920/065 | Affiliated to National Examination Board (NEB)",
};

const INITIAL_TEMPLATES: DocumentTemplate[] = [
  {
    id: "dt-1",
    code: "TPL_OFFICIAL_LETTERHEAD",
    title: "Standard Official Letterhead",
    category: "OFFICIAL_LETTER",
    layoutConfig: DEFAULT_LAYOUT,
    signatures: [
      {
        title: "Prepared By",
        name: "Administrative Officer",
        showSignatureImage: false,
      },
      {
        title: "Authorized Signatory",
        name: "Dr. K. P. Sharma (Principal)",
        showSignatureImage: true,
      },
    ],
    isDefault: true,
  },
  {
    id: "dt-2",
    code: "TPL_FEE_INVOICE",
    title: "Tax Fee Invoice & Receipt",
    category: "INVOICE",
    layoutConfig: DEFAULT_LAYOUT,
    signatures: [
      {
        title: "Accountant",
        name: "Suresh Bhattarai",
        showSignatureImage: true,
      },
    ],
    isDefault: true,
  },
  {
    id: "dt-3",
    code: "TPL_CHARACTER_CERT",
    title: "Character & Transfer Certificate",
    category: "CERTIFICATE",
    layoutConfig: DEFAULT_LAYOUT,
    signatures: [
      {
        title: "Class Teacher",
        name: "Anish Dahal",
        showSignatureImage: false,
      },
      {
        title: "Principal",
        name: "Dr. K. P. Sharma",
        showSignatureImage: true,
      },
    ],
    isDefault: true,
  },
];

export default function DocumentTemplateMaster() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>(INITIAL_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate>(INITIAL_TEMPLATES[0]);
  const [previewCategory, setPreviewCategory] = useState<DocumentCategory>("OFFICIAL_LETTER");

  // Field Updates
  const handleLayoutChange = (field: keyof HeaderFooterLayout, value: string) => {
    setSelectedTemplate((prev) => ({
      ...prev,
      layoutConfig: { ...prev.layoutConfig, [field]: value },
    }));
  };

  const handleSignatureChange = (index: number, field: keyof SignatureBlock, value: any) => {
    const updatedSigs = [...selectedTemplate.signatures];
    updatedSigs[index] = { ...updatedSigs[index], [field]: value };
    setSelectedTemplate((prev) => ({ ...prev, signatures: updatedSigs }));
  };

  const handleAddSignature = () => {
    setSelectedTemplate((prev) => ({
      ...prev,
      signatures: [
        ...prev.signatures,
        { title: "Signatory Title", name: "Officer Name", showSignatureImage: false },
      ],
    }));
  };

  const handleRemoveSignature = (index: number) => {
    setSelectedTemplate((prev) => ({
      ...prev,
      signatures: prev.signatures.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === selectedTemplate.id ? selectedTemplate : t))
    );
    toast.success(`Template "${selectedTemplate.title}" saved successfully!`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">
            Print & Document Template Master
          </h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Configure reusable Letterheads, Headers, Footers, and Digital Signature blocks for Invoices, Certificates, and Letters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="rounded-lg border border-line bg-background px-4 py-2.5 text-xs font-bold text-ink hover:bg-panel transition-all"
          >
            🖨️ Test Print Preview
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-teal px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm hover:bg-navy transition-all"
          >
            Save Template
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: TEMPLATE SELECTOR & EDITOR */}
        <div className="space-y-6 lg:col-span-6">
          {/* Selector */}
          <div className="rounded-xl border border-line bg-panel p-4 shadow-2xs space-y-3">
            <label className="block text-xs font-black uppercase tracking-wider text-muted">
              Select Document Template
            </label>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplate(tpl);
                    setPreviewCategory(tpl.category);
                  }}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    selectedTemplate.id === tpl.id
                      ? "border-teal bg-teal/5 font-bold text-teal shadow-2xs"
                      : "border-line bg-background text-muted hover:border-muted"
                  }`}
                >
                  <p className="text-[10px] font-black uppercase text-navy">
                    {tpl.category.replace("_", " ")}
                  </p>
                  <p className="mt-1 text-xs font-bold text-ink truncate">{tpl.title}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Header & Branding Settings */}
          <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs space-y-4 text-xs">
            <h2 className="text-xs font-black uppercase tracking-wider text-navy border-b border-line pb-2">
              1. Header & Institutional Branding
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-ink">Institution Name</label>
                <input
                  type="text"
                  value={selectedTemplate.layoutConfig.schoolName}
                  onChange={(e) => handleLayoutChange("schoolName", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 font-bold text-ink focus:border-teal focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-ink">Tagline / Motto</label>
                <input
                  type="text"
                  value={selectedTemplate.layoutConfig.tagline}
                  onChange={(e) => handleLayoutChange("tagline", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-ink">Affiliation / Regd Info</label>
              <input
                type="text"
                value={selectedTemplate.layoutConfig.affiliationText}
                onChange={(e) => handleLayoutChange("affiliationText", e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-ink">Primary Theme Color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedTemplate.layoutConfig.primaryColor}
                    onChange={(e) => handleLayoutChange("primaryColor", e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent p-1"
                  />
                  <input
                    type="text"
                    value={selectedTemplate.layoutConfig.primaryColor}
                    onChange={(e) => handleLayoutChange("primaryColor", e.target.value)}
                    className="w-full rounded-md border border-line bg-background px-3 py-1.5 uppercase font-mono text-ink focus:border-teal focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-ink">Accent Theme Color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedTemplate.layoutConfig.secondaryColor}
                    onChange={(e) => handleLayoutChange("secondaryColor", e.target.value)}
                    className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent p-1"
                  />
                  <input
                    type="text"
                    value={selectedTemplate.layoutConfig.secondaryColor}
                    onChange={(e) => handleLayoutChange("secondaryColor", e.target.value)}
                    className="w-full rounded-md border border-line bg-background px-3 py-1.5 uppercase font-mono text-ink focus:border-teal focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer & Contact Settings */}
          <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs space-y-4 text-xs">
            <h2 className="text-xs font-black uppercase tracking-wider text-navy border-b border-line pb-2">
              2. Footer & Contact Information
            </h2>

            <div>
              <label className="block font-bold text-ink">Campus Address</label>
              <input
                type="text"
                value={selectedTemplate.layoutConfig.address}
                onChange={(e) => handleLayoutChange("address", e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-ink">Phone Numbers</label>
                <input
                  type="text"
                  value={selectedTemplate.layoutConfig.phone}
                  onChange={(e) => handleLayoutChange("phone", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-ink">Official Email / Website</label>
                <input
                  type="text"
                  value={selectedTemplate.layoutConfig.email}
                  onChange={(e) => handleLayoutChange("email", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-ink">Footer Notice / Disclaimer</label>
              <input
                type="text"
                value={selectedTemplate.layoutConfig.footerNotice}
                onChange={(e) => handleLayoutChange("footerNotice", e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
              />
            </div>
          </div>

          {/* Signature Blocks */}
          <div className="rounded-xl border border-line bg-panel p-5 shadow-2xs space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-navy">
                3. Reusable Signature Blocks ({selectedTemplate.signatures.length})
              </h2>
              <button
                onClick={handleAddSignature}
                className="text-[11px] font-bold text-teal hover:underline"
              >
                + Add Signatory
              </button>
            </div>

            <div className="space-y-3">
              {selectedTemplate.signatures.map((sig, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-line bg-background p-3 grid grid-cols-12 gap-2 items-center"
                >
                  <div className="col-span-5">
                    <label className="text-[10px] font-bold text-muted">Title / Role</label>
                    <input
                      type="text"
                      value={sig.title}
                      onChange={(e) => handleSignatureChange(idx, "title", e.target.value)}
                      className="mt-0.5 w-full rounded border border-line bg-panel px-2 py-1 text-ink focus:border-teal focus:outline-none font-bold"
                    />
                  </div>

                  <div className="col-span-5">
                    <label className="text-[10px] font-bold text-muted">Person Name</label>
                    <input
                      type="text"
                      value={sig.name}
                      onChange={(e) => handleSignatureChange(idx, "name", e.target.value)}
                      className="mt-0.5 w-full rounded border border-line bg-panel px-2 py-1 text-ink focus:border-teal focus:outline-none"
                    />
                  </div>

                  <div className="col-span-2 flex justify-end">
                    <button
                      onClick={() => handleRemoveSignature(idx)}
                      className="text-coral font-bold hover:underline"
                      title="Remove Signatory"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE PRINT SHEET PREVIEW */}
        <div className="space-y-4 lg:col-span-6">
          <div className="sticky top-6 rounded-xl border border-line bg-panel p-5 shadow-2xs">
            <h2 className="text-xs font-black uppercase tracking-wider text-muted mb-3 flex items-center justify-between">
              <span>📄 Live Print Layout Preview</span>
              <span className="rounded bg-navy/10 px-2 py-0.5 text-[10px] font-bold text-navy">
                A4 Standard View
              </span>
            </h2>

            {/* Simulated Paper Document Sheet */}
            <div className="mx-auto w-full max-w-[500px] min-h-[640px] rounded border border-line bg-white p-8 text-slate-800 shadow-md flex flex-col justify-between font-sans">
              
              {/* HEADER SECTION */}
              <div>
                <div
                  className="pb-4 border-b-2 flex items-start justify-between"
                  style={{ borderColor: selectedTemplate.layoutConfig.primaryColor }}
                >
                  <div className="space-y-1">
                    <h1
                      className="text-lg font-black leading-tight uppercase tracking-tight"
                      style={{ color: selectedTemplate.layoutConfig.primaryColor }}
                    >
                      {selectedTemplate.layoutConfig.schoolName}
                    </h1>
                    <p
                      className="text-[10px] font-semibold tracking-wide"
                      style={{ color: selectedTemplate.layoutConfig.secondaryColor }}
                    >
                      {selectedTemplate.layoutConfig.tagline}
                    </p>
                    <p className="text-[9px] text-slate-500 font-medium">
                      {selectedTemplate.layoutConfig.affiliationText}
                    </p>
                  </div>

                  {/* Institution Logo Stamp Placeholder */}
                  <div className="h-12 w-12 rounded border border-slate-200 bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
                    Logo
                  </div>
                </div>

                {/* SIMULATED CONTENT BASED ON CATEGORY */}
                <div className="py-8 space-y-4 text-xs">
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold border-b border-slate-100 pb-2">
                    <span>Ref No: MIS/2026/0928</span>
                    <span>Date: 2026-09-29</span>
                  </div>

                  {previewCategory === "OFFICIAL_LETTER" && (
                    <div className="space-y-3">
                      <p className="font-bold text-slate-900">TO WHOM IT MAY CONCERN</p>
                      <p className="text-[11px] leading-relaxed text-slate-600">
                        This is to certify that <strong>Aarav Sharma</strong> is a full-time student registered in Grade 10 at {selectedTemplate.layoutConfig.schoolName}. During his study, he has demonstrated commendable moral conduct and academic progress.
                      </p>
                    </div>
                  )}

                  {previewCategory === "INVOICE" && (
                    <div className="space-y-3">
                      <p className="font-bold text-slate-900">TAX INVOICE & FEE RECEIPT</p>
                      <table className="w-full text-left text-[11px] border border-slate-200">
                        <thead className="bg-slate-100 text-slate-700 font-bold">
                          <tr>
                            <th className="p-1.5">Particulars</th>
                            <th className="p-1.5 text-right">Amount (NPR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="p-1.5">Monthly Tuition Fee (Ashoj)</td>
                            <td className="p-1.5 text-right font-mono">Rs. 4,500</td>
                          </tr>
                          <tr>
                            <td className="p-1.5">Dance & Arts Club Fee</td>
                            <td className="p-1.5 text-right font-mono">Rs. 1,200</td>
                          </tr>
                          <tr className="font-bold bg-slate-50">
                            <td className="p-1.5">Total Paid</td>
                            <td className="p-1.5 text-right font-mono text-teal-700">Rs. 5,700</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* SIGNATURE BLOCKS & FOOTER */}
              <div className="space-y-6">
                {/* Signatures */}
                <div className="grid grid-cols-2 gap-4 pt-6">
                  {selectedTemplate.signatures.map((sig, i) => (
                    <div key={i} className="text-center space-y-1">
                      <div className="h-10 border-b border-dashed border-slate-300 flex items-end justify-center pb-1">
                        <span className="font-serif italic text-xs text-slate-400">
                          [Digital Signature]
                        </span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-800">{sig.name}</p>
                      <p className="text-[9px] font-semibold text-slate-500 uppercase">{sig.title}</p>
                    </div>
                  ))}
                </div>

                {/* FOOTER SECTION */}
                <div
                  className="pt-3 border-t text-center text-[9px] text-slate-500 space-y-0.5"
                  style={{ borderColor: selectedTemplate.layoutConfig.primaryColor }}
                >
                  <p className="font-bold text-slate-700">{selectedTemplate.layoutConfig.address}</p>
                  <p>
                    Tel: {selectedTemplate.layoutConfig.phone} | Email: {selectedTemplate.layoutConfig.email}
                  </p>
                  <p className="italic text-[8px] text-slate-400 pt-1">
                    {selectedTemplate.layoutConfig.footerNotice}
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}