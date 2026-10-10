import type {
  AdmissionDocument,
  AdmissionFormData,
} from "@/modules/admissions/types";

function PrintDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "Not provided"}</dd>
    </div>
  );
}

export function AdmissionReview({
  form,
  documents,
  error,
  onConsentChange,
}: {
  form: AdmissionFormData;
  documents: AdmissionDocument[];
  error?: string;
  onConsentChange: (checked: boolean) => void;
}) {
  return (
    <>
      <div className="admission-review-summary grid gap-5">
        <div className="grid grid-cols-2 gap-4 rounded border border-[#e6e9e1] bg-[#fbfaf5] p-5 text-[11px] max-[700px]:grid-cols-1">
          <div>
            <p className="m-0 text-[9px] uppercase tracking-[.12em] text-[#82908c]">
              Student
            </p>
            <strong>
              {form.firstName || "Not provided"} {form.lastName}
            </strong>
            <p className="m-0 text-[#82908c]">
              {form.dateOfBirth || "Date not provided"} ·{" "}
              {form.gender || "Gender not provided"}
            </p>
          </div>
          <div>
            <p className="m-0 text-[9px] uppercase tracking-[.12em] text-[#82908c]">
              Guardian
            </p>
            <strong>{form.guardianName || "Not provided"}</strong>
            <p className="m-0 text-[#82908c]">
              {form.guardianEmail || "Email not provided"}
            </p>
          </div>
          <div>
            <p className="m-0 text-[9px] uppercase tracking-[.12em] text-[#82908c]">
              Placement
            </p>
            <strong>{form.entryGrade || "Grade not provided"}</strong>
            <p className="m-0 text-[#82908c]">
              {form.entryDate || "Date not provided"} · {form.academicYear}
            </p>
          </div>
          <div>
            <p className="m-0 text-[9px] uppercase tracking-[.12em] text-[#82908c]">
              Documents
            </p>
            <strong>
              {documents.filter((document) => document.fileName).length}{" "}
              attached
            </strong>
            <p className="m-0 text-[#82908c]">
              {
                documents.filter(
                  (document) => document.required && !document.fileName,
                ).length
              }{" "}
              required remaining
            </p>
          </div>
        </div>
        <label className="flex items-start gap-3 text-[11px] leading-[1.6] text-[#4e6963]">
          <input
            checked={form.consent}
            className="mt-1"
            name="consent"
            onChange={(event) => onConsentChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            I confirm that the information provided is accurate and consent to
            Pathivara processing this application for admissions purposes.
          </span>
        </label>
        {error && (
          <p className="m-0 text-[10px] text-[#b45e4f]" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="admission-printable">
        <h2>Student admission application</h2>
        <p>Pathivara vidhya mandir · {form.academicYear}</p>
        <div className="print-grid">
          <PrintDetail
            label="Student name"
            value={`${form.firstName} ${form.middleName} ${form.lastName}`}
          />
          <PrintDetail label="Date of birth" value={form.dateOfBirth} />
          <PrintDetail label="Gender" value={form.gender} />
          <PrintDetail label="Nationality" value={form.nationality} />
          <PrintDetail label="Previous school" value={form.previousSchool} />
          <PrintDetail label="Guardian" value={form.guardianName} />
          <PrintDetail label="Relationship" value={form.guardianRelationship} />
          <PrintDetail label="Email" value={form.guardianEmail} />
          <PrintDetail label="Phone" value={form.guardianPhone} />
          <PrintDetail
            label="Address"
            value={`${form.address}, ${form.city} ${form.postalCode}`}
          />
          <PrintDetail label="Entry grade" value={form.entryGrade} />
          <PrintDetail label="Entry date" value={form.entryDate} />
          <PrintDetail label="Language support" value={form.languageSupport} />
          <PrintDetail
            label="Emergency contact"
            value={`${form.emergencyContact} · ${form.emergencyPhone}`}
          />
          <PrintDetail
            label="Medical notes"
            value={form.medicalNotes || "None provided"}
          />
          <PrintDetail
            label="Allergies"
            value={form.allergies || "None provided"}
          />
        </div>
        <h3>Documents</h3>
        <ul>
          {documents.map((document) => (
            <li key={document.type}>
              {document.type}: {document.fileName || "Not attached"}
            </li>
          ))}
        </ul>
        <p className="print-signature">
          Parent / guardian signature: ____________________ &nbsp;&nbsp; Date:
          ____________________
        </p>
      </div>
    </>
  );
}
