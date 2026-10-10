import type { ChangeEvent } from "react";
import type { AdmissionDocument } from "@/modules/admissions/types";

export function AdmissionDocuments({
  documents,
  onChange,
}: {
  documents: AdmissionDocument[];
  onChange: (index: number, event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid gap-3">
      <p className="m-0 text-[11px] leading-[1.6] text-[#82908c]">
        PDF, JPG, or PNG files up to 10 MB. Documents are securely reviewed by
        the admissions team.
      </p>
      {documents.map((document, index) => (
        <div
          className="flex items-center justify-between gap-4 rounded border border-[#e6e9e1] bg-[#fbfaf5] p-4 max-[600px]:items-start max-[600px]:flex-col"
          key={document.type}
        >
          <div>
            <strong className="block text-[12px] text-[#183d3b]">
              {document.type}
              {document.required && (
                <span className="ml-1 text-[#b45e4f]">*</span>
              )}
            </strong>
            <small className="text-[10px] text-[#82908c]">
              {document.fileName || "No file selected"}
            </small>
          </div>
          <label className="cursor-pointer rounded border border-[#b9cbc3] px-3 py-2 text-[10px] font-semibold text-[#26766d]">
            Choose file
            <input
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(event) => onChange(index, event)}
              type="file"
            />
          </label>
        </div>
      ))}
    </div>
  );
}
