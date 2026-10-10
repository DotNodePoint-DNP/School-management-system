import { z } from "zod";
import type { AdmissionFormData } from "./types";

const phone = z.string().regex(/^\+?[1-9][\d\s().-]{6,18}$/, "Enter a valid phone number.");

export const admissionSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  middleName: z.string(), lastName: z.string().trim().min(1, "Last name is required."),
  dateOfBirth: z.string().min(1, "Date of birth is required."), gender: z.string().min(1, "Select a gender."),
  nationality: z.string(), previousSchool: z.string(), guardianName: z.string().trim().min(1, "Guardian name is required."),
  guardianRelationship: z.string().min(1, "Select a relationship."), guardianEmail: z.email("Enter a valid email address."),
  guardianPhone: phone, address: z.string().trim().min(1, "Address is required."), city: z.string().trim().min(1, "City is required."), postalCode: z.string(),
  entryGrade: z.string().min(1, "Select an entry grade."), academicYear: z.string(), entryDate: z.string().min(1, "Entry date is required."),
  languageSupport: z.string(), medicalNotes: z.string(), allergies: z.string(), emergencyContact: z.string().trim().min(1, "Emergency contact is required."), emergencyPhone: phone,
  consent: z.literal(true, { error: "Confirm that the information is accurate before submitting." }),
});

const fieldsByStep: (keyof AdmissionFormData)[][] = [["firstName", "lastName", "dateOfBirth", "gender"], ["guardianName", "guardianRelationship", "guardianEmail", "guardianPhone", "address", "city"], ["entryGrade", "entryDate"], ["emergencyContact", "emergencyPhone"], [], ["consent"]];

export function validateAdmissionStep(step: number, form: AdmissionFormData) {
  const parsed = admissionSchema.safeParse({ ...form, consent: step === 5 ? form.consent : true });
  if (parsed.success) return {};
  const relevant = new Set(fieldsByStep[step]);
  return Object.fromEntries(parsed.error.issues.filter((issue) => relevant.has(issue.path[0] as keyof AdmissionFormData)).map((issue) => [issue.path[0], issue.message]));
}
