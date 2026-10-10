"use client";

import Link from "next/link";
import { useState } from "react";
import { AdmissionForm } from "./AdmissionForm";
export function AdmissionDashboardActions() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      
      <button
        className="quick-action"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        + New admission
      </button>
      {isOpen && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto bg-[#17252d]/45 p-4"
          role="dialog"
        >
          <div className="admission-modal relative mx-auto my-6 max-w-[1280px] shadow-2xl">
            <button
              aria-label="Close new admission form"
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border-0 bg-white text-lg text-[#183d3b] shadow"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              ×
            </button>
            <AdmissionForm />
          </div>
        </div>
      )}
    </>
  );
}
