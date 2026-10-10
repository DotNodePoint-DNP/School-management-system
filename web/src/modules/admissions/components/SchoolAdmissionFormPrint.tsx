"use client";

import React, { useState } from "react";
import { toast } from "sonner";

// --- TYPES & INTERFACES ---
export interface SiblingInfo {
  id: string;
  fullName: string;
  grade: string;
  rollNo: string;
}

export interface DocumentUpload {
  fileName: string;
  fileSize: string;
  isUploaded: boolean;
}

export interface StudentAdmissionData {
  id?: string;
  academicYear: string;
  gradeApplying: string;
  // Personal Info
  fullNameNp: string;
  fullNameEn: string;
  dobBS: string;
  dobAD: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  casteEthnicity: string;
  nationality: string;
  religion: string;
  bloodGroup: string;
  // Permanent Address
  permProvince: string;
  permDistrict: string;
  permMunicipality: string;
  permWardNo: string;
  permToleName: string;
  // Temporary / Current Address
  sameAsPermanent: boolean;
  tempProvince: string;
  tempDistrict: string;
  tempMunicipality: string;
  tempWardNo: string;
  tempToleName: string;
  // Parents Info
  fatherName: string;
  fatherOccupation: string;
  fatherPhone: string;
  motherName: string;
  motherOccupation: string;
  motherPhone: string;
  // Local Guardian Info (Separated)
  hasLocalGuardian: boolean;
  guardianName: string;
  guardianRelation: string;
  guardianPhone: string;
  guardianOccupation: string;
  // Siblings (Optional)
  siblings: SiblingInfo[];
  // Uploadable Documents (Compulsory Verification)
  docs: {
    birthCertificate: DocumentUpload; // MANDATORY
    transferCertificate: DocumentUpload; // MANDATORY IF TRANSFER
    previousGradeSheet: DocumentUpload;
    characterCertificate: DocumentUpload;
    fatherCitizenship: DocumentUpload;
    motherCitizenship: DocumentUpload;
  };
}

// Demo Grade List loaded from backend API
const DEMO_GRADES = [
  "Nursery",
  "LKG",
  "UKG",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10 (SEE)",
  "Grade 11",
  "Grade 12",
];

const INITIAL_FORM_DATA: StudentAdmissionData = {
  academicYear: "2083 B.S.",
  gradeApplying: "Grade 1",
  fullNameNp: "आरभ शर्मा",
  fullNameEn: "Aarav Sharma",
  dobBS: "2076-05-12",
  dobAD: "2019-08-28",
  gender: "MALE",
  casteEthnicity: "Brahmin/Chhetri",
  nationality: "Nepali",
  religion: "Hinduism",
  bloodGroup: "O+",
  // Permanent Address
  permProvince: "Koshi Province",
  permDistrict: "Jhapa",
  permMunicipality: "Birtamode Municipality",
  permWardNo: "5",
  permToleName: "Muktichowk",
  // Temporary Address
  sameAsPermanent: true,
  tempProvince: "Koshi Province",
  tempDistrict: "Jhapa",
  tempMunicipality: "Birtamode Municipality",
  tempWardNo: "5",
  tempToleName: "Muktichowk",
  // Parents
  fatherName: "Ram Chandra Sharma",
  fatherOccupation: "Business",
  fatherPhone: "9842000000",
  motherName: "Sita Sharma",
  motherOccupation: "Teacher",
  motherPhone: "9804000000",
  // Local Guardian
  hasLocalGuardian: false,
  guardianName: "",
  guardianRelation: "",
  guardianPhone: "",
  guardianOccupation: "",
  // Siblings
  siblings: [
    { id: "s-1", fullName: "Ananya Sharma", grade: "Grade 4", rollNo: "08" },
  ],
  // Document Uploads
  docs: {
    birthCertificate: { fileName: "birth_cert_aarav.pdf", fileSize: "1.2 MB", isUploaded: true },
    transferCertificate: { fileName: "tc_sunrise_school.pdf", fileSize: "850 KB", isUploaded: true },
    previousGradeSheet: { fileName: "ukg_marksheet.pdf", fileSize: "2.1 MB", isUploaded: true },
    characterCertificate: { fileName: "", fileSize: "", isUploaded: false },
    fatherCitizenship: { fileName: "father_citizenship.jpg", fileSize: "3.4 MB", isUploaded: true },
    motherCitizenship: { fileName: "", fileSize: "", isUploaded: false },
  },
};

export default function StudentAdmissionEngine() {
  const [formData, setFormData] = useState<StudentAdmissionData>(INITIAL_FORM_DATA);
  const [viewMode, setViewMode] = useState<"FORM_ENTRY" | "PRINT_PREVIEW">("FORM_ENTRY");
  const [isPrintBlankMode, setIsPrintBlankMode] = useState<boolean>(false);

  // Field Updates
  const handleChange = (field: keyof StudentAdmissionData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Sync Temporary Address if Same as Permanent
  const handleAddressSync = (isSame: boolean) => {
    if (isSame) {
      setFormData((prev) => ({
        ...prev,
        sameAsPermanent: true,
        tempProvince: prev.permProvince,
        tempDistrict: prev.permDistrict,
        tempMunicipality: prev.permMunicipality,
        tempWardNo: prev.permWardNo,
        tempToleName: prev.permToleName,
      }));
    } else {
      setFormData((prev) => ({ ...prev, sameAsPermanent: false }));
    }
  };

  // Handle Document File Upload Simulation
  const handleFileUpload = (docKey: keyof StudentAdmissionData["docs"], e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData((prev) => ({
        ...prev,
        docs: {
          ...prev.docs,
          [docKey]: {
            fileName: file.name,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            isUploaded: true,
          },
        },
      }));
      toast.success(`Uploaded: ${file.name}`);
    }
  };

  // Sibling Management
  const addSibling = () => {
    setFormData((prev) => ({
      ...prev,
      siblings: [...prev.siblings, { id: Date.now().toString(), fullName: "", grade: DEMO_GRADES[0], rollNo: "" }],
    }));
  };

  const removeSibling = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      siblings: prev.siblings.filter((s) => s.id !== id),
    }));
  };

  const handleSiblingChange = (id: string, field: keyof SiblingInfo, value: string) => {
    setFormData((prev) => ({
      ...prev,
      siblings: prev.siblings.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    }));
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.docs.birthCertificate.isUploaded) {
      toast.error("Validation Error: Official Birth Certificate upload is mandatory!");
      return;
    }
    toast.success("Student Admission Record saved successfully!");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 print:p-0 print:max-w-none">
      {/* HEADER TOOLBAR (HIDDEN ON PRINT) */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">
            Student Admission Engine
          </h1>
          <p className="mt-1 text-xs font-medium text-muted">
            Dynamic CEHRD-aligned school admission form with document upload verification & printable layouts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setViewMode(viewMode === "FORM_ENTRY" ? "PRINT_PREVIEW" : "FORM_ENTRY")}
            className="rounded-lg border border-line bg-panel px-4 py-2.5 text-xs font-bold text-ink hover:bg-background transition-all"
          >
            {viewMode === "FORM_ENTRY" ? "👁️ Print Preview Mode" : "✏️ Edit Student Data"}
          </button>

          <button
            onClick={() => {
              setIsPrintBlankMode(!isPrintBlankMode);
              setViewMode("PRINT_PREVIEW");
            }}
            className={`rounded-lg px-4 py-2.5 text-xs font-bold transition-all border ${
              isPrintBlankMode
                ? "border-navy bg-navy/10 text-navy"
                : "border-teal bg-teal/10 text-teal"
            }`}
          >
            {isPrintBlankMode ? "📋 Print Filled Form" : "📄 Print Blank Form"}
          </button>

          <button
            onClick={() => window.print()}
            className="rounded-lg bg-teal px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm hover:bg-navy transition-all"
          >
            🖨️ Print Form / Export PDF
          </button>
        </div>
      </div>

      {/* DYNAMIC FORM ENTRY MODE */}
      {viewMode === "FORM_ENTRY" && (
        <form onSubmit={handleSaveForm} className="space-y-6 print:hidden">
          {/* SECTION 1: ACADEMIC & PERSONAL DETAILS */}
          <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-navy border-b border-line pb-2">
              1. Academic & Student Personal Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-bold text-ink">Academic Session *</label>
                <input
                  type="text"
                  value={formData.academicYear}
                  onChange={(e) => handleChange("academicYear", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-ink">Applying Grade (From Backend) *</label>
                <select
                  value={formData.gradeApplying}
                  onChange={(e) => handleChange("gradeApplying", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-bold focus:border-teal focus:outline-none"
                >
                  {DEMO_GRADES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-ink">Gender *</label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleChange("gender", e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-ink">Full Name (English BLOCK) *</label>
                <input
                  type="text"
                  value={formData.fullNameEn}
                  onChange={(e) => handleChange("fullNameEn", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink uppercase font-mono font-bold focus:border-teal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-ink">Full Name (Nepali - देवनागरी) *</label>
                <input
                  type="text"
                  value={formData.fullNameNp}
                  onChange={(e) => handleChange("fullNameNp", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-serif focus:border-teal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-ink">Blood Group</label>
                <input
                  type="text"
                  placeholder="e.g. O+, A+"
                  value={formData.bloodGroup}
                  onChange={(e) => handleChange("bloodGroup", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink uppercase font-mono focus:border-teal focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-ink">Date of Birth (B.S.) *</label>
                <input
                  type="text"
                  placeholder="YYYY-MM-DD"
                  value={formData.dobBS}
                  onChange={(e) => handleChange("dobBS", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-mono focus:border-teal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-ink">Date of Birth (A.D.) *</label>
                <input
                  type="date"
                  value={formData.dobAD}
                  onChange={(e) => handleChange("dobAD", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-ink">Caste / Ethnicity</label>
                <input
                  type="text"
                  value={formData.casteEthnicity}
                  onChange={(e) => handleChange("casteEthnicity", e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: PERMANENT & TEMPORARY ADDRESS */}
          <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs space-y-6">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-navy border-b border-line pb-2">
                2. Permanent Address (स्थायी ठेगाना)
              </h2>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-ink">Province *</label>
                  <input
                    type="text"
                    value={formData.permProvince}
                    onChange={(e) => handleChange("permProvince", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-ink">District *</label>
                  <input
                    type="text"
                    value={formData.permDistrict}
                    onChange={(e) => handleChange("permDistrict", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-ink">Municipality / Rural Mun. *</label>
                  <input
                    type="text"
                    value={formData.permMunicipality}
                    onChange={(e) => handleChange("permMunicipality", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-ink">Ward No & Tole *</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      placeholder="Ward"
                      value={formData.permWardNo}
                      onChange={(e) => handleChange("permWardNo", e.target.value)}
                      className="w-20 rounded-md border border-line bg-background px-3 py-2 text-ink font-mono focus:border-teal focus:outline-none"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Tole Name"
                      value={formData.permToleName}
                      onChange={(e) => handleChange("permToleName", e.target.value)}
                      className="flex-1 rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Temporary Address Section */}
            <div className="border-t border-line pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-navy">
                  Temporary / Current Present Address (अस्थायी ठेगाना)
                </h2>

                <label className="flex items-center gap-2 text-xs font-bold text-teal cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sameAsPermanent}
                    onChange={(e) => handleAddressSync(e.target.checked)}
                    className="h-4 w-4 rounded border-line text-teal focus:ring-teal"
                  />
                  Same as Permanent Address
                </label>
              </div>

              {!formData.sameAsPermanent && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-2">
                  <div>
                    <label className="block font-bold text-ink">Province</label>
                    <input
                      type="text"
                      value={formData.tempProvince}
                      onChange={(e) => handleChange("tempProvince", e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-ink">District</label>
                    <input
                      type="text"
                      value={formData.tempDistrict}
                      onChange={(e) => handleChange("tempDistrict", e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-ink">Municipality</label>
                    <input
                      type="text"
                      value={formData.tempMunicipality}
                      onChange={(e) => handleChange("tempMunicipality", e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-ink">Ward No & Tole</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        placeholder="Ward"
                        value={formData.tempWardNo}
                        onChange={(e) => handleChange("tempWardNo", e.target.value)}
                        className="w-20 rounded-md border border-line bg-background px-3 py-2 text-ink font-mono focus:border-teal focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Tole Name"
                        value={formData.tempToleName}
                        onChange={(e) => handleChange("tempToleName", e.target.value)}
                        className="flex-1 rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: PARENTS DETAILS */}
          <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-navy border-b border-line pb-2">
              3. Parents Information (माता-पिताको विवरण)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Father */}
              <div className="space-y-3 p-4 rounded-lg border border-line bg-background">
                <h3 className="font-bold text-ink border-b border-line pb-1">Father's Details</h3>
                <div>
                  <label className="block font-bold text-ink">Father's Full Name *</label>
                  <input
                    type="text"
                    value={formData.fatherName}
                    onChange={(e) => handleChange("fatherName", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-ink focus:border-teal focus:outline-none font-bold"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-ink">Occupation</label>
                    <input
                      type="text"
                      value={formData.fatherOccupation}
                      onChange={(e) => handleChange("fatherOccupation", e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-ink">Mobile Phone *</label>
                    <input
                      type="text"
                      value={formData.fatherPhone}
                      onChange={(e) => handleChange("fatherPhone", e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-ink font-mono focus:border-teal focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Mother */}
              <div className="space-y-3 p-4 rounded-lg border border-line bg-background">
                <h3 className="font-bold text-ink border-b border-line pb-1">Mother's Details</h3>
                <div>
                  <label className="block font-bold text-ink">Mother's Full Name *</label>
                  <input
                    type="text"
                    value={formData.motherName}
                    onChange={(e) => handleChange("motherName", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-ink focus:border-teal focus:outline-none font-bold"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-ink">Occupation</label>
                    <input
                      type="text"
                      value={formData.motherOccupation}
                      onChange={(e) => handleChange("motherOccupation", e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-ink">Mobile Phone *</label>
                    <input
                      type="text"
                      value={formData.motherPhone}
                      onChange={(e) => handleChange("motherPhone", e.target.value)}
                      className="mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-ink font-mono focus:border-teal focus:outline-none"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: LOCAL GUARDIAN DETAILS (SEPARATE) */}
          <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-navy">
                4. Local Guardian Details (संरक्षकको विवरण - Optional)
              </h2>

              <label className="flex items-center gap-2 text-xs font-bold text-teal cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.hasLocalGuardian}
                  onChange={(e) => handleChange("hasLocalGuardian", e.target.checked)}
                  className="h-4 w-4 rounded border-line text-teal focus:ring-teal"
                />
                Student Stays With Local Guardian
              </label>
            </div>

            {formData.hasLocalGuardian && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-2">
                <div>
                  <label className="block font-bold text-ink">Guardian Name *</label>
                  <input
                    type="text"
                    value={formData.guardianName}
                    onChange={(e) => handleChange("guardianName", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-bold focus:border-teal focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-ink">Relationship to Student *</label>
                  <input
                    type="text"
                    placeholder="e.g. Uncle, Hosteller"
                    value={formData.guardianRelation}
                    onChange={(e) => handleChange("guardianRelation", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-ink">Guardian Phone *</label>
                  <input
                    type="text"
                    value={formData.guardianPhone}
                    onChange={(e) => handleChange("guardianPhone", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink font-mono focus:border-teal focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-ink">Occupation</label>
                  <input
                    type="text"
                    value={formData.guardianOccupation}
                    onChange={(e) => handleChange("guardianOccupation", e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 text-ink focus:border-teal focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: SIBLINGS INFORMATION (OPTIONAL) */}
          <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-navy">
                5. Siblings Studying at this School (दाजुभाई / दिदीबहिनी - Optional)
              </h2>
              <button
                type="button"
                onClick={addSibling}
                className="text-xs font-bold text-teal hover:underline"
              >
                + Add Sibling
              </button>
            </div>

            {formData.siblings.length === 0 ? (
              <p className="text-xs text-muted italic">No siblings registered.</p>
            ) : (
              <div className="space-y-3">
                {formData.siblings.map((sib, index) => (
                  <div key={sib.id} className="grid grid-cols-12 gap-3 items-center text-xs bg-background p-3 rounded-lg border border-line">
                    <div className="col-span-5">
                      <label className="block text-[10px] font-bold text-muted">Sibling Full Name</label>
                      <input
                        type="text"
                        value={sib.fullName}
                        onChange={(e) => handleSiblingChange(sib.id, "fullName", e.target.value)}
                        className="mt-0.5 w-full rounded border border-line bg-panel px-2.5 py-1 text-ink focus:border-teal focus:outline-none font-bold"
                      />
                    </div>

                    <div className="col-span-4">
                      <label className="block text-[10px] font-bold text-muted">Grade / Class</label>
                      <select
                        value={sib.grade}
                        onChange={(e) => handleSiblingChange(sib.id, "grade", e.target.value)}
                        className="mt-0.5 w-full rounded border border-line bg-panel px-2.5 py-1 text-ink focus:border-teal focus:outline-none font-bold"
                      >
                        {DEMO_GRADES.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-muted">Roll No</label>
                      <input
                        type="text"
                        value={sib.rollNo}
                        onChange={(e) => handleSiblingChange(sib.id, "rollNo", e.target.value)}
                        className="mt-0.5 w-full rounded border border-line bg-panel px-2 py-1 text-ink font-mono focus:border-teal focus:outline-none"
                      />
                    </div>

                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeSibling(sib.id)}
                        className="text-coral font-bold hover:underline"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 6: UPLOADABLE DOCUMENTS CHECKLIST */}
          <div className="rounded-xl border border-line bg-panel p-6 shadow-2xs space-y-4">
            <h2 className="text-xs font-black uppercase tracking-wider text-navy border-b border-line pb-2">
              6. Compulsory Document Upload & Verification Checklist
            </h2>
            <p className="text-xs text-muted">
              Note: Files uploaded here will be stored in system records. <strong>Printed forms will show document checkmarks and document titles only</strong> (uploaded images/files will not print).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Birth Cert */}
              <div className="p-3 rounded-lg border border-coral/30 bg-coral/5 space-y-2">
                <div className="flex justify-between font-bold text-coral">
                  <span>1. Birth Certificate *</span>
                  <span className="text-[10px] uppercase font-black">COMPULSORY</span>
                </div>
                <input
                  type="file"
                  onChange={(e) => handleFileUpload("birthCertificate", e)}
                  className="w-full text-xs text-ink file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-teal file:text-panel file:font-bold hover:file:bg-navy"
                />
                {formData.docs.birthCertificate.isUploaded && (
                  <p className="text-[10px] font-mono text-teal font-bold">
                    ✓ Attached: {formData.docs.birthCertificate.fileName} ({formData.docs.birthCertificate.fileSize})
                  </p>
                )}
              </div>

              {/* Transfer Cert */}
              <div className="p-3 rounded-lg border border-line bg-background space-y-2">
                <div className="flex justify-between font-bold text-ink">
                  <span>2. Transfer Certificate (TC)</span>
                  <span className="text-[10px] text-muted">Mandatory if Transfer</span>
                </div>
                <input
                  type="file"
                  onChange={(e) => handleFileUpload("transferCertificate", e)}
                  className="w-full text-xs text-ink file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-teal file:text-panel file:font-bold hover:file:bg-navy"
                />
                {formData.docs.transferCertificate.isUploaded && (
                  <p className="text-[10px] font-mono text-teal font-bold">
                    ✓ Attached: {formData.docs.transferCertificate.fileName} ({formData.docs.transferCertificate.fileSize})
                  </p>
                )}
              </div>

              {/* Marksheet */}
              <div className="p-3 rounded-lg border border-line bg-background space-y-2">
                <div className="font-bold text-ink">3. Grade Sheet / Marksheet</div>
                <input
                  type="file"
                  onChange={(e) => handleFileUpload("previousGradeSheet", e)}
                  className="w-full text-xs text-ink file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-teal file:text-panel file:font-bold hover:file:bg-navy"
                />
                {formData.docs.previousGradeSheet.isUploaded && (
                  <p className="text-[10px] font-mono text-teal font-bold">
                    ✓ Attached: {formData.docs.previousGradeSheet.fileName} ({formData.docs.previousGradeSheet.fileSize})
                  </p>
                )}
              </div>

              {/* Father Citizenship */}
              <div className="p-3 rounded-lg border border-line bg-background space-y-2">
                <div className="font-bold text-ink">4. Father / Guardian Citizenship Copy</div>
                <input
                  type="file"
                  onChange={(e) => handleFileUpload("fatherCitizenship", e)}
                  className="w-full text-xs text-ink file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-teal file:text-panel file:font-bold hover:file:bg-navy"
                />
                {formData.docs.fatherCitizenship.isUploaded && (
                  <p className="text-[10px] font-mono text-teal font-bold">
                    ✓ Attached: {formData.docs.fatherCitizenship.fileName} ({formData.docs.fatherCitizenship.fileSize})
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="submit"
              className="rounded-lg bg-teal px-6 py-3 text-xs font-bold uppercase tracking-wider text-panel shadow-sm hover:bg-navy transition-all"
            >
              Save Student Admission Record
            </button>
          </div>
        </form>
      )}

      {/* PRINTABLE A4 SHEET PREVIEW (PRINT COMPLIANT) */}
      {(viewMode === "PRINT_PREVIEW" || typeof window !== "undefined") && (
        <div className={`mx-auto w-full max-w-[800px] bg-white p-8 text-slate-900 shadow-lg border border-slate-200 print:shadow-none print:border-none print:p-0 font-sans leading-tight ${viewMode === "FORM_ENTRY" ? "hidden print:block" : "block"}`}>
          
          {/* BRANDING HEADER */}
          <div className="border-b-2 border-slate-900 pb-3 flex items-center justify-between">
            <div className="h-16 w-16 border border-slate-300 rounded bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
              Logo
            </div>

            <div className="text-center space-y-0.5">
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Mayura International School
              </h1>
              <p className="text-[11px] font-bold text-slate-700">
                Birtamode-5, Jhapa, Koshi Province, Nepal | Tel: +977-23-540000
              </p>
              <p className="text-[10px] text-slate-500 font-medium">
                Affiliated to National Examination Board (NEB) | School Code: 12-049
              </p>
              <div className="mt-1 inline-block rounded bg-slate-900 px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                STUDENT ADMISSION FORM (Academic Session: {!isPrintBlankMode ? formData.academicYear : "2083/84"})
              </div>
            </div>

            <div className="h-20 w-16 border-2 border-dashed border-slate-400 rounded flex flex-col items-center justify-center text-center p-1 text-[8px] font-bold text-slate-500 uppercase">
              <span>Affix PP Photo</span>
            </div>
          </div>

          {/* REGISTRATION METADATA */}
          <div className="mt-3 flex justify-between text-[11px] font-bold text-slate-700 border-b border-slate-200 pb-2">
            <div>Form No: <span className="font-mono text-slate-900">{!isPrintBlankMode ? "ADM-2083-0149" : "...................."}</span></div>
            <div>Grade Applying For: <span className="font-mono text-slate-900 underline font-black">{!isPrintBlankMode ? formData.gradeApplying : "...................."}</span></div>
            <div>Date: <span className="font-mono text-slate-900">{!isPrintBlankMode ? "2083-01-15 B.S." : "20.... / .... / ...."}</span></div>
          </div>

          {/* SECTION 1: PERSONAL DETAILS */}
          <div className="mt-4 space-y-2">
            <h2 className="bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-900 border-l-4 border-slate-900">
              1. Student Personal Details (विद्यार्थीको विवरण)
            </h2>

            <div className="grid grid-cols-12 gap-y-2 text-xs">
              <div className="col-span-12 flex items-center">
                <span className="w-44 font-bold text-slate-700">Full Name (Nepali):</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold font-serif">
                  {!isPrintBlankMode ? formData.fullNameNp : ""}
                </span>
              </div>

              <div className="col-span-12 flex items-center">
                <span className="w-44 font-bold text-slate-700">Full Name (English BLOCK):</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-mono font-bold uppercase">
                  {!isPrintBlankMode ? formData.fullNameEn : ""}
                </span>
              </div>

              <div className="col-span-6 flex items-center">
                <span className="w-44 font-bold text-slate-700">Date of Birth (B.S.):</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-mono font-bold">
                  {!isPrintBlankMode ? formData.dobBS : ""}
                </span>
              </div>

              <div className="col-span-6 flex items-center pl-2">
                <span className="w-32 font-bold text-slate-700">Date of Birth (A.D.):</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-mono font-bold">
                  {!isPrintBlankMode ? formData.dobAD : ""}
                </span>
              </div>

              <div className="col-span-6 flex items-center">
                <span className="w-44 font-bold text-slate-700">Gender (लिङ्ग):</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode ? formData.gender : "[  ] Male   [  ] Female"}
                </span>
              </div>

              <div className="col-span-6 flex items-center pl-2">
                <span className="w-32 font-bold text-slate-700">Blood Group:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-mono font-bold">
                  {!isPrintBlankMode ? formData.bloodGroup : ""}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: PERMANENT & TEMPORARY ADDRESS */}
          <div className="mt-4 space-y-2">
            <h2 className="bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-900 border-l-4 border-slate-900">
              2. Permanent & Temporary Address (ठेगाना)
            </h2>

            <div className="grid grid-cols-12 gap-y-2 text-xs">
              <div className="col-span-12 flex items-center font-bold text-slate-900 underline">
                A. Permanent Address (स्थायी ठेगाना):
              </div>
              <div className="col-span-6 flex items-center">
                <span className="w-32 font-bold text-slate-700">Province / District:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode ? `${formData.permProvince}, ${formData.permDistrict}` : ""}
                </span>
              </div>
              <div className="col-span-6 flex items-center pl-2">
                <span className="w-32 font-bold text-slate-700">Municipality / Ward:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode ? `${formData.permMunicipality}-${formData.permWardNo}, ${formData.permToleName}` : ""}
                </span>
              </div>

              <div className="col-span-12 flex items-center font-bold text-slate-900 underline pt-1">
                B. Current / Temporary Address (अस्थायी ठेगाना):
              </div>
              <div className="col-span-12 flex items-center">
                <span className="w-32 font-bold text-slate-700">Full Temporary Address:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode
                    ? formData.sameAsPermanent
                      ? "Same as Permanent Address"
                      : `${formData.tempMunicipality}-${formData.tempWardNo}, ${formData.tempToleName}, ${formData.tempDistrict}`
                    : ""}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3: PARENTS & GUARDIAN */}
          <div className="mt-4 space-y-2">
            <h2 className="bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-900 border-l-4 border-slate-900">
              3. Parents & Guardian Information (अभिभावकको विवरण)
            </h2>

            <div className="grid grid-cols-12 gap-y-2 text-xs">
              {/* Father */}
              <div className="col-span-6 flex items-center">
                <span className="w-32 font-bold text-slate-700">Father's Name:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode ? formData.fatherName : ""}
                </span>
              </div>
              <div className="col-span-6 flex items-center pl-2">
                <span className="w-24 font-bold text-slate-700">Mobile Phone:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-mono font-bold">
                  {!isPrintBlankMode ? formData.fatherPhone : ""}
                </span>
              </div>

              {/* Mother */}
              <div className="col-span-6 flex items-center">
                <span className="w-32 font-bold text-slate-700">Mother's Name:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode ? formData.motherName : ""}
                </span>
              </div>
              <div className="col-span-6 flex items-center pl-2">
                <span className="w-24 font-bold text-slate-700">Mobile Phone:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-mono font-bold">
                  {!isPrintBlankMode ? formData.motherPhone : ""}
                </span>
              </div>

              {/* Local Guardian */}
              <div className="col-span-6 flex items-center pt-1">
                <span className="w-32 font-bold text-slate-700">Local Guardian:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode ? (formData.hasLocalGuardian ? formData.guardianName : "N/A (Stays with Parents)") : ""}
                </span>
              </div>
              <div className="col-span-6 flex items-center pl-2 pt-1">
                <span className="w-24 font-bold text-slate-700">Relation/Phone:</span>
                <span className="flex-1 border-b border-dotted border-slate-400 font-bold">
                  {!isPrintBlankMode && formData.hasLocalGuardian ? `${formData.guardianRelation} (${formData.guardianPhone})` : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 4: SIBLINGS (OPTIONAL) */}
          {!isPrintBlankMode && formData.siblings.length > 0 && (
            <div className="mt-4 space-y-2">
              <h2 className="bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-900 border-l-4 border-slate-900">
                4. Siblings Currently Enrolled (दाजुभाई / दिदीबहिनी)
              </h2>
              <div className="text-xs space-y-1">
                {formData.siblings.map((s, i) => (
                  <div key={s.id} className="flex justify-between border-b border-slate-200 pb-0.5">
                    <span>{i + 1}. {s.fullName}</span>
                    <span className="font-bold">{s.grade} (Roll: {s.rollNo || "N/A"})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 5: COMPULSORY DOCUMENTS CHECKLIST (PRINT SAFE - NO IMAGES) */}
          <div className="mt-4 space-y-2">
            <h2 className="bg-slate-100 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-slate-900 border-l-4 border-slate-900">
              5. Document Verification Checklist (संलग्न कागजातहरू)
            </h2>

            <div className="grid grid-cols-2 gap-2 text-xs p-2 border border-slate-200 rounded">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">
                  [{!isPrintBlankMode && formData.docs.birthCertificate.isUploaded ? "✓" : "  "}]
                </span>
                <span className="font-bold text-slate-800">
                  1. Birth Certificate <span className="text-red-600 font-black">(COMPULSORY / अनिवार्य)</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">
                  [{!isPrintBlankMode && formData.docs.transferCertificate.isUploaded ? "✓" : "  "}]
                </span>
                <span className="font-bold text-slate-800">
                  2. Transfer Certificate (TC) <span className="text-slate-500 font-medium">(Mandatory if Transfer)</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">
                  [{!isPrintBlankMode && formData.docs.previousGradeSheet.isUploaded ? "✓" : "  "}]
                </span>
                <span>3. Grade Sheet / Marksheet</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900">
                  [{!isPrintBlankMode && formData.docs.fatherCitizenship.isUploaded ? "✓" : "  "}]
                </span>
                <span>4. Parent / Guardian Citizenship Copy</span>
              </div>
            </div>
          </div>

          {/* SIGNATURE BLOCK */}
          <div className="mt-6 pt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs">
            <div className="space-y-1">
              <div className="h-10 border-b border-slate-400"></div>
              <p className="font-bold text-slate-800">Parent / Guardian Signature</p>
            </div>

            <div className="space-y-1">
              <div className="h-10 border-b border-slate-400"></div>
              <p className="font-bold text-slate-800">Admission Officer</p>
            </div>

            <div className="space-y-1">
              <div className="h-10 border-b border-slate-400"></div>
              <p className="font-bold text-slate-800">Principal Signature & Stamp</p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}