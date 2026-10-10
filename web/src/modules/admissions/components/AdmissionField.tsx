import type { ChangeEvent } from "react";
import type { AdmissionFormData } from "@/modules/admissions/types";

export type AdmissionFieldProps = {
  label: string;
  name: keyof AdmissionFormData;
  value: string;
  error?: string;
  onChange: (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
};

export function AdmissionField({
  label,
  name,
  value,
  error,
  onChange,
  type = "text",
  placeholder,
  required = false,
}: AdmissionFieldProps) {
  return (
    <label className="grid gap-2 text-[11px] font-semibold text-[#4e6963]">
      <span>
        {label}
        {required && <span className="ml-1 text-[#b45e4f]">*</span>}
      </span>
      <input
        aria-invalid={Boolean(error)}
        className={`box-border w-full rounded border bg-[#fbfaf5] px-3 py-3 text-[12px] font-normal text-[#183d3b] outline-none transition focus:border-[#6a9a8c] ${error ? "border-[#c97b6e]" : "border-[#dfe2d8]"}`}
        name={name}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
      {error && (
        <span className="text-[10px] font-normal text-[#b45e4f]" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
