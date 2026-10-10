"use client";

import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const SCHOOL_TYPES = [
  "Public",
  "Private",
  "Boarding",
  "Day School",
  "International",
  "Vocational",
] as const;

const schoolSchema = z.object({
  name: z.string().min(2, "School name is required"),
  abbreviation: z.string().min(1, "Abbreviation is required"),
  logo: z.any().optional(),
  address: z.string().min(3, "Address is required"),
  phone: z.string().min(7, "Valid phone number is required"),
  email: z.string().email("Invalid email address"),
  panVat: z.string().optional(),
  motto: z.string().optional(),
  description: z.string().optional(),
  establishedDate: z.string().min(1, "Established date is required"),
  types: z.array(z.string()).min(1, "Select at least one school type"),
});

export type SchoolFormData = z.infer<typeof schoolSchema>;

interface SchoolFormProps {
  initialData?: Partial<SchoolFormData> & { logoUrl?: string };
  onSubmit: (data: SchoolFormData) => Promise<void> | void;
  isLoading?: boolean;
}

export default function SchoolProfileForm({
  initialData,
  onSubmit,
  isLoading = false,
}: SchoolFormProps) {
  const [logoPreview, setLogoPreview] = useState<string | null>(
    initialData?.logoUrl || null
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<SchoolFormData>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      name: initialData?.name || "",
      abbreviation: initialData?.abbreviation || "",
      address: initialData?.address || "",
      phone: initialData?.phone || "",
      email: initialData?.email || "",
      panVat: initialData?.panVat || "",
      motto: initialData?.motto || "",
      description: initialData?.description || "",
      establishedDate: initialData?.establishedDate || "",
      types: initialData?.types || [],
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setValue("logo", file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const inputStyles = (hasError?: boolean) => `
    mt-1.5 block w-full rounded-md border bg-panel px-3.5 py-2 text-sm font-medium text-ink 
    placeholder:text-muted/60 antialiased transition-all duration-150
    ${
      hasError
        ? "border-coral focus:border-coral focus:ring-1 focus:ring-coral"
        : "border-line hover:border-navy/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
    }
  `;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto max-w-full rounded-xl border border-line bg-panel p-8 shadow-sm transition-all"
    >
      {/* Enterprise Header Section */}
      <div className="flex flex-col gap-1 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-ink">
              {initialData ? "School Profile Settings" : "Institution Registration"}
            </h2>
          </div>
          <p className="mt-1 text-xs font-normal text-muted">
            Manage legal entity details, primary contacts, and administrative metadata.
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {/* Section 1: Basic Information */}
        <section className="space-y-4">
          <div className="border-b border-line/60 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
              1. Institutional Identity
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Legal School Name <span className="text-coral">*</span>
              </label>
              <input
                {...register("name")}
                type="text"
                placeholder="e.g. Pathivara Vidhya Mandir Secondary School"
                className={inputStyles(!!errors.name)}
              />
              {errors.name ? (
                <p className="mt-1 text-xs font-semibold text-coral">
                  {errors.name.message}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted">
                  Official name as registered with the Ministry of Education.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Abbreviation <span className="text-coral">*</span>
              </label>
              <input
                {...register("abbreviation")}
                type="text"
                placeholder="e.g. PVM"
                className={inputStyles(!!errors.abbreviation)}
              />
              {errors.abbreviation && (
                <p className="mt-1 text-xs font-semibold text-coral">
                  {errors.abbreviation.message}
                </p>
              )}
            </div>
          </div>

          {/* Logo & Motto Integration */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-4 items-start pt-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5">
                Institutional Brand / Logo
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-line bg-background">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                      No Crest
                    </span>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="logo-upload"
                    className="inline-flex cursor-pointer items-center rounded-md border border-line bg-panel px-3 py-1.5 text-xs font-semibold text-ink shadow-xs transition hover:bg-background hover:border-navy/30"
                  >
                    Upload Crest
                  </label>
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="sr-only"
                  />
                  <p className="mt-1 text-[10px] text-muted">
                    PNG, JPG up to 2MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Institutional Motto / Vision Statement
              </label>
              <input
                {...register("motto")}
                type="text"
                placeholder="e.g. Excellence, Integrity, Service"
                className={inputStyles()}
              />
              <p className="mt-1 text-[11px] text-muted">
                Displayed on student report cards, certificates, and invoices.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Contact & Operational Details */}
        <section className="space-y-4">
          <div className="border-b border-line/60 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
              2. Contact & Administrative Details
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Primary Phone <span className="text-coral">*</span>
              </label>
              <input
                {...register("phone")}
                type="text"
                placeholder="+977 023-XXXXXX"
                className={inputStyles(!!errors.phone)}
              />
              {errors.phone && (
                <p className="mt-1 text-xs font-semibold text-coral">
                  {errors.phone.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Official Email Address <span className="text-coral">*</span>
              </label>
              <input
                {...register("email")}
                type="email"
                placeholder="administration@school.edu.np"
                className={inputStyles(!!errors.email)}
              />
              {errors.email && (
                <p className="mt-1 text-xs font-semibold text-coral">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                PAN / VAT Number <span className="text-muted font-normal">(Optional)</span>
              </label>
              <input
                {...register("panVat")}
                type="text"
                placeholder="e.g. 600123456"
                className={inputStyles()}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Date of Establishment <span className="text-coral">*</span>
              </label>
              <input
                {...register("establishedDate")}
                type="date"
                className={inputStyles(!!errors.establishedDate)}
              />
              {errors.establishedDate && (
                <p className="mt-1 text-xs font-semibold text-coral">
                  {errors.establishedDate.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink">
              Physical Location / Address <span className="text-coral">*</span>
            </label>
            <input
              {...register("address")}
              type="text"
              placeholder="Ward No. 03, Damak, Jhapa, Koshi Province"
              className={inputStyles(!!errors.address)}
            />
            {errors.address && (
              <p className="mt-1 text-xs font-semibold text-coral">
                {errors.address.message}
              </p>
            )}
          </div>
        </section>

        {/* Section 3: Classification & Governance */}
        <section className="space-y-4">
          <div className="border-b border-line/60 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
              3. Classification & Governance
            </h3>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-2">
              School Operating Model <span className="text-coral">*</span>
            </label>
            <Controller
              name="types"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {SCHOOL_TYPES.map((type) => {
                    const isSelected = field.value?.includes(type);
                    return (
                      <button
                        type="button"
                        key={type}
                        onClick={() => {
                          const updated = isSelected
                            ? field.value.filter((t) => t !== type)
                            : [...(field.value || []), type];
                          field.onChange(updated);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-md border transition-all duration-150 ${
                          isSelected
                            ? "bg-navy text-panel border-navy shadow-xs"
                            : "bg-background text-ink border-line hover:border-navy/40"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? "bg-amber" : "bg-muted/40"
                          }`}
                        />
                        {type}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.types && (
              <p className="mt-1.5 text-xs font-semibold text-coral">
                {errors.types.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink">
              Institutional Profile / Summary
            </label>
            <textarea
              {...register("description")}
              rows={4}
              placeholder="Provide a formal summary of the school's background, facilities, accreditation, and administrative scope..."
              className={inputStyles()}
            />
          </div>
        </section>
      </div>

      {/* Enterprise Action Footer */}
      <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
        <p className="text-[11px] font-medium text-muted">
          All modifications are audited and stamped with admin credentials.
        </p>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center justify-center rounded-md bg-teal px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-navy focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2 disabled:opacity-50"
          >
            {isLoading
              ? "Saving..."
              : initialData
              ? "Update Profile"
              : "Save & Initialize"}
          </button>
        </div>
      </div>
    </form>
  );
}