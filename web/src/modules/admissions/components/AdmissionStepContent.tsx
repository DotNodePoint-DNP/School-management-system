import type { ChangeEvent } from "react";
import type { AdmissionFormData } from "@/modules/admissions/types";
import { AdmissionDocuments } from "./AdmissionDocuments";
import { AdmissionField } from "./AdmissionField";
import { AdmissionReview } from "./AdmissionReview";

type Props = {
  step: number;
  form: AdmissionFormData;
  errors: Record<string, string>;
  documents: Parameters<typeof AdmissionDocuments>[0]["documents"];
  onChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  onDocumentsChange: (
    index: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
};

const selectClass =
  "rounded border border-[#dfe2d8] bg-[#fbfaf5] px-3 py-3 text-[12px] font-normal text-[#183d3b] outline-none focus:border-[#6a9a8c]";
const labelClass = "grid gap-2 text-[11px] font-semibold text-[#4e6963]";

export function AdmissionStepContent({
  step,
  form,
  errors,
  documents,
  onChange,
  onDocumentsChange,
}: Props) {
  if (step === 0)
    return (
      <div className="grid gap-5">
        <div className="grid grid-cols-3 gap-4 max-[700px]:grid-cols-1">
          <AdmissionField
            label="First name"
            name="firstName"
            value={form.firstName}
            error={errors.firstName}
            onChange={onChange}
            required
          />
          <AdmissionField
            label="Middle name"
            name="middleName"
            value={form.middleName}
            error={errors.middleName}
            onChange={onChange}
          />
          <AdmissionField
            label="Last name"
            name="lastName"
            value={form.lastName}
            error={errors.lastName}
            onChange={onChange}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
          <AdmissionField
            label="Date of birth"
            name="dateOfBirth"
            value={form.dateOfBirth}
            error={errors.dateOfBirth}
            onChange={onChange}
            type="date"
            required
          />
          <SelectField
            label="Gender"
            name="gender"
            value={form.gender}
            onChange={onChange}
            error={errors.gender}
            options={["Female", "Male", "Non-binary", "Prefer not to say"]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
          <AdmissionField
            label="Nationality"
            name="nationality"
            value={form.nationality}
            error={errors.nationality}
            onChange={onChange}
            placeholder="e.g. Nepali"
          />
          <AdmissionField
            label="Previous school"
            name="previousSchool"
            value={form.previousSchool}
            error={errors.previousSchool}
            onChange={onChange}
            placeholder="School name, if applicable"
          />
        </div>
      </div>
    );

  if (step === 1)
    return (
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
          <AdmissionField
            label="Primary guardian name"
            name="guardianName"
            value={form.guardianName}
            error={errors.guardianName}
            onChange={onChange}
            required
          />
          <SelectField
            label="Relationship"
            name="guardianRelationship"
            value={form.guardianRelationship}
            onChange={onChange}
            error={errors.guardianRelationship}
            options={["Parent", "Legal guardian", "Foster carer", "Other"]}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
          <AdmissionField
            label="Email address"
            name="guardianEmail"
            value={form.guardianEmail}
            error={errors.guardianEmail}
            onChange={onChange}
            type="email"
            required
          />
          <AdmissionField
            label="Phone number"
            name="guardianPhone"
            value={form.guardianPhone}
            error={errors.guardianPhone}
            onChange={onChange}
            type="tel"
            placeholder="+977 98..."
            required
          />
        </div>
        <AdmissionField
          label="Home address"
          name="address"
          value={form.address}
          error={errors.address}
          onChange={onChange}
          required
        />
        <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
          <AdmissionField
            label="City / town"
            name="city"
            value={form.city}
            error={errors.city}
            onChange={onChange}
            required
          />
          <AdmissionField
            label="Postal code"
            name="postalCode"
            value={form.postalCode}
            error={errors.postalCode}
            onChange={onChange}
          />
        </div>
      </div>
    );

  if (step === 2)
    return (
      <div className="grid grid-cols-2 gap-5 max-[700px]:grid-cols-1">
        <SelectField
          label="Entry grade"
          name="entryGrade"
          value={form.entryGrade}
          onChange={onChange}
          error={errors.entryGrade}
          options={[
            "Playgroup",
            "Nursary",
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
            "Grade 10",
          ]}
        />
        <AdmissionField
          label="Entry date"
          name="entryDate"
          value={form.entryDate}
          error={errors.entryDate}
          onChange={onChange}
          type="date"
          required
        />
        <SelectField
          label="Academic year"
          name="academicYear"
          value={form.academicYear}
          onChange={onChange}
          options={["2025 / 26", "2026 / 27"]}
        />
      </div>
    );

  if (step === 3)
    return (
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
          <AdmissionField
            label="Emergency contact"
            name="emergencyContact"
            value={form.emergencyContact}
            error={errors.emergencyContact}
            onChange={onChange}
            required
          />
          <AdmissionField
            label="Emergency phone"
            name="emergencyPhone"
            value={form.emergencyPhone}
            error={errors.emergencyPhone}
            onChange={onChange}
            type="tel"
            required
          />
        </div>
        <SelectField
          label="Language support"
          name="languageSupport"
          value={form.languageSupport}
          onChange={onChange}
          options={[
            "No additional support",
            "English language support",
            "One-to-one language support",
          ]}
        />
        <TextAreaField
          label="Medical notes"
          name="medicalNotes"
          value={form.medicalNotes}
          onChange={onChange}
          placeholder="Share relevant conditions or support plans"
        />
        <TextAreaField
          label="Allergies"
          name="allergies"
          value={form.allergies}
          onChange={onChange}
          placeholder="List allergies, or enter None"
        />
      </div>
    );

  if (step === 4)
    return (
      <AdmissionDocuments documents={documents} onChange={onDocumentsChange} />
    );
  return (
    <AdmissionReview
      form={form}
      documents={documents}
      error={errors.consent}
      onConsentChange={(checked) =>
        onChange({
          target: { name: "consent", type: "checkbox", checked },
        } as ChangeEvent<HTMLInputElement>)
      }
    />
  );
}

function SelectField({
  label,
  name,
  value,
  error,
  onChange,
  options,
}: {
  label: string;
  name: keyof AdmissionFormData;
  value: string;
  error?: string;
  onChange: Props["onChange"];
  options: string[];
}) {
  return (
    <label className={labelClass}>
      {label}
      <select
        className={selectClass}
        name={name}
        onChange={onChange}
        value={value}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      {error && <small className="font-normal text-[#b45e4f]">{error}</small>}
    </label>
  );
}
function TextAreaField({
  label,
  name,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  name: keyof AdmissionFormData;
  value: string;
  onChange: Props["onChange"];
  placeholder: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <textarea
        className="min-h-20 rounded border border-[#dfe2d8] bg-[#fbfaf5] px-3 py-3 text-[12px] font-normal text-[#183d3b] outline-none focus:border-[#6a9a8c]"
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
