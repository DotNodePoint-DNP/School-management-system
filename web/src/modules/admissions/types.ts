export const admissionSteps = [
  "Student details",
  "Guardian details",
  "Academic placement",
  "Health & support",
  "Documents",
  "Review",
] as const;

export type AdmissionStep = (typeof admissionSteps)[number];

export type AdmissionFormData = {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  previousSchool: string;
  guardianName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  address: string;
  city: string;
  postalCode: string;
  entryGrade: string;
  academicYear: string;
  entryDate: string;
  languageSupport: string;
  medicalNotes: string;
  allergies: string;
  emergencyContact: string;
  emergencyPhone: string;
  consent: boolean;
};

export const emptyAdmissionForm: AdmissionFormData = {
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  previousSchool: "",
  guardianName: "",
  guardianRelationship: "",
  guardianEmail: "",
  guardianPhone: "",
  address: "",
  city: "",
  postalCode: "",
  entryGrade: "",
  academicYear: "2025 / 26",
  entryDate: "",
  languageSupport: "No additional support",
  medicalNotes: "",
  allergies: "",
  emergencyContact: "",
  emergencyPhone: "",
  consent: false,
};

export type AdmissionDocument = {
  type: string;
  fileName: string;
  required: boolean;
};

export const admissionDocuments: AdmissionDocument[] = [
  { type: "Birth certificate", fileName: "", required: true },
  { type: "Previous school report", fileName: "", required: true },
  { type: "Proof of address", fileName: "", required: true },
  { type: "Medical record", fileName: "", required: false },
];

