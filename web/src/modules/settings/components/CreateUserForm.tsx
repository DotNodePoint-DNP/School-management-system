"use client";

import React from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const ROLES = ["Teacher", "Parent", "Accountant", "Librarian", "Admin"] as const;

const userCreationSchema = z
  .object({
    mode: z.enum(["manual", "invite"]),
    role: z.enum(ROLES, {
      message: "Please select a role",
    }),
    email: z.string().email("Valid email address is required"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    qualification: z.string().optional(),
    department: z.string().optional(),
    studentIds: z.array(z.object({ id: z.string() })).optional(),
    designation: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "manual") {
      if (!data.firstName || data.firstName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "First name is required",
          path: ["firstName"],
        });
      }
      if (!data.lastName || data.lastName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Last name is required",
          path: ["lastName"],
        });
      }
    }
  });

export type UserCreationFormData = z.infer<typeof userCreationSchema>;

interface UserCreationFormProps {
  onSubmit: (data: UserCreationFormData) => Promise<void> | void;
  isLoading?: boolean;
}

export default function UserCreationForm({
  onSubmit,
  isLoading = false,
}: UserCreationFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<UserCreationFormData>({
    resolver: zodResolver(userCreationSchema),
    defaultValues: {
      mode: "invite",
      role: "Teacher",
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      qualification: "",
      department: "",
      designation: "",
      studentIds: [{ id: "" }],
    },
  });

  const selectedMode = watch("mode");
  const selectedRole = watch("role");

  const { fields, append, remove } = useFieldArray({
    control,
    name: "studentIds",
  });

  const inputStyles = (hasError?: boolean) => `
    mt-1.5 block w-full rounded-md border bg-panel px-3.5 py-2 text-sm font-medium text-ink 
    placeholder:text-muted/60 transition-all duration-150
    ${
      hasError
        ? "border-coral focus:border-coral focus:ring-1 focus:ring-coral"
        : "border-line hover:border-navy/40 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
    }
  `;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="p-6 md:p-8">
      {/* Header */}
      <div className="border-b border-line pb-4 pr-6">
        <h2 className="text-lg font-bold tracking-tight text-ink">
          Add System User
        </h2>
        <p className="mt-0.5 text-xs text-muted">
          Provision new staff and guardians or set up accounts manually.
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {/* Creation Mode Toggle */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-2">
            Provisioning Method
          </label>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => setValue("mode", "invite")}
              className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-xs font-bold transition-all ${
                selectedMode === "invite"
                  ? "border-navy bg-navy text-panel shadow-xs"
                  : "border-line bg-background text-ink hover:border-navy/40"
              }`}
            >
              📧 Send Invitation Email
            </button>

            <button
              type="button"
              onClick={() => setValue("mode", "manual")}
              className={`flex items-center justify-center gap-2 rounded-lg border py-2 text-xs font-bold transition-all ${
                selectedMode === "manual"
                  ? "border-navy bg-navy text-panel shadow-xs"
                  : "border-line bg-background text-ink hover:border-navy/40"
              }`}
            >
              ⚙️ Manual Account Setup
            </button>
          </div>
        </div>

        {/* Role Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-2">
            Target Role <span className="text-coral">*</span>
          </label>
          <Controller
            name="role"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {ROLES.map((role) => (
                  <button
                    type="button"
                    key={role}
                    onClick={() => field.onChange(role)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md border transition-all ${
                      field.value === role
                        ? "bg-teal text-panel border-teal shadow-xs"
                        : "bg-background text-ink border-line hover:border-navy/40"
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        <hr className="border-line/60" />

        {/* Primary Contact Details */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={selectedMode === "invite" ? "md:col-span-3" : ""}>
            <label className="block text-xs font-bold uppercase tracking-wider text-ink">
              Email Address <span className="text-coral">*</span>
            </label>
            <input
              {...register("email")}
              type="email"
              placeholder="user@school.edu.np"
              className={inputStyles(!!errors.email)}
            />
            {errors.email && (
              <p className="mt-1 text-xs font-semibold text-coral">
                {errors.email.message}
              </p>
            )}
          </div>

          {selectedMode === "manual" && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                  First Name <span className="text-coral">*</span>
                </label>
                <input
                  {...register("firstName")}
                  type="text"
                  placeholder="First name"
                  className={inputStyles(!!errors.firstName)}
                />
                {errors.firstName && (
                  <p className="mt-1 text-xs font-semibold text-coral">
                    {errors.firstName.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                  Last Name <span className="text-coral">*</span>
                </label>
                <input
                  {...register("lastName")}
                  type="text"
                  placeholder="Last name"
                  className={inputStyles(!!errors.lastName)}
                />
                {errors.lastName && (
                  <p className="mt-1 text-xs font-semibold text-coral">
                    {errors.lastName.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                  Phone Number
                </label>
                <input
                  {...register("phone")}
                  type="text"
                  placeholder="+977 98XXXXXXXX"
                  className={inputStyles()}
                />
              </div>
            </>
          )}
        </div>

        {/* Dynamic Role-Based Fields */}
        {selectedRole === "Teacher" && (
          <div className="rounded-lg border border-line bg-background/50 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
              Academic Information
            </h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                  Qualification
                </label>
                <input
                  {...register("qualification")}
                  type="text"
                  placeholder="e.g. M.Sc. Physics"
                  className={inputStyles()}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                  Department
                </label>
                <input
                  {...register("department")}
                  type="text"
                  placeholder="e.g. Science"
                  className={inputStyles()}
                />
              </div>
            </div>
          </div>
        )}

        {selectedRole === "Parent" && (
          <div className="rounded-lg border border-line bg-background/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
                Associated Student(s)
              </h4>
              <button
                type="button"
                onClick={() => append({ id: "" })}
                className="text-xs font-bold text-teal hover:underline"
              >
                + Link Another Student
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      {...register(`studentIds.${index}.id` as const)}
                      placeholder="Student Registration / ID Number"
                      className={inputStyles()}
                    />
                  </div>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="mt-1 text-xs font-bold text-coral hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(selectedRole === "Accountant" || selectedRole === "Librarian") && (
          <div className="rounded-lg border border-line bg-background/50 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-navy">
              Administrative Assignment
            </h4>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Job Designation
              </label>
              <input
                {...register("designation")}
                type="text"
                placeholder={
                  selectedRole === "Accountant"
                    ? "e.g. Senior Accountant"
                    : "e.g. Assistant Librarian"
                }
                className={inputStyles()}
              />
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-end border-t border-line pt-4">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center rounded-md bg-teal px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-panel shadow-sm transition-all hover:bg-navy disabled:opacity-50"
        >
          {isLoading
            ? "Processing..."
            : selectedMode === "invite"
            ? "Send Invitation"
            : "Create User Account"}
        </button>
      </div>
    </form>
  );
}