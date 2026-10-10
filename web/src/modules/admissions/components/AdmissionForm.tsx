"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { admissionDocuments, admissionSteps, emptyAdmissionForm, type AdmissionFormData } from "@/modules/admissions/types";
import { validateAdmissionStep } from "@/modules/admissions/validation";
import { submitAdmission } from "@/modules/admissions/services/admissions-service";
import { AdmissionProgress } from "./AdmissionProgress";
import { AdmissionStepContent } from "./AdmissionStepContent";

const draftKey = "pathivara-admission-draft";
const descriptions = ["Tell us about the student joining Pathivara.", "Add the primary contact and household details.", "Help us prepare the right academic placement.", "Share information that helps us support the student.", "Attach the documents our admissions team needs.", "Review the application before sending it to admissions."];

export function AdmissionForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<AdmissionFormData>(emptyAdmissionForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState(admissionDocuments);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const restore = window.setTimeout(() => {
      const saved = window.localStorage.getItem(draftKey);
      if (!saved) return;
      try {
        const draft = JSON.parse(saved) as { form: AdmissionFormData; step: number };
        setForm({ ...emptyAdmissionForm, ...draft.form });
        setStep(Math.min(draft.step, admissionSteps.length - 1));
        setSavedAt("Draft restored");
      } catch { window.localStorage.removeItem(draftKey); }
    }, 0);
    return () => window.clearTimeout(restore);
  }, []);

  const completedSteps = useMemo(() => admissionSteps.map((_, index) => index < step), [step]);
  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) { const { name, value, type } = event.target; setForm((current) => ({ ...current, [name]: type === "checkbox" ? (event.target as HTMLInputElement).checked : value })); setErrors((current) => ({ ...current, [name]: "" })); }
  function saveDraft() { window.localStorage.setItem(draftKey, JSON.stringify({ form, step })); setSavedAt("Draft saved just now"); toast.success("Admission draft saved."); }
  function nextStep() { const nextErrors = validateAdmissionStep(step, form); if (step === 4 && documents.some((document) => document.required && !document.fileName)) { toast.error("Attach each required document before continuing."); return; } setErrors(nextErrors); if (Object.keys(nextErrors).length) { toast.error("Please complete the required fields before continuing."); return; } setStep((current) => Math.min(current + 1, admissionSteps.length - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function previousStep() { setErrors({}); setStep((current) => Math.max(current - 1, 0)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function handleDocumentChange(index: number, event: ChangeEvent<HTMLInputElement>) { const fileName = event.target.files?.[0]?.name ?? ""; setDocuments((current) => current.map((document, currentIndex) => currentIndex === index ? { ...document, fileName } : document)); }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const nextErrors = validateAdmissionStep(5, form); setErrors(nextErrors); if (Object.keys(nextErrors).length) { toast.error("Please confirm the application details before submitting."); return; } setIsSubmitting(true); try { await submitAdmission({ application: form, documents }); window.localStorage.removeItem(draftKey); setSavedAt("Application submitted"); toast.success("Admission application submitted for review."); } catch { toast.error("Unable to submit the admission application. Please try again."); } finally { setIsSubmitting(false); } }

  return <main className="min-h-screen bg-[#f4f0e8] text-[#183d3b]"><header className="flex items-center justify-between border-b border-[#d9dbd0] bg-[#fffdf8] px-[5vw] py-5"><Link className="flex items-center gap-3 text-[#183d3b] no-underline" href="/dashboard"><span className="grid h-9 w-9 rotate-[-8deg] place-items-center rounded-[11px_11px_11px_3px] bg-[#edbd63] font-[700_24px_Georgia,serif]">n</span><span><strong className="block font-[600_15px_Georgia,serif]">Pathivara</strong><small className="text-[9px] uppercase tracking-[.18em] text-[#71817e]">Admissions office</small></span></Link><div className="text-right text-[10px] text-[#82908c]"><strong className="block text-[#4e6963]">New student application</strong><span>2025 / 26 academic year</span></div></header><div className="mx-auto grid w-full max-w-[1240px] grid-cols-[250px_1fr] gap-10 px-6 py-10 max-[850px]:grid-cols-1 max-[850px]:py-6"><AdmissionProgress step={step} completedSteps={completedSteps} onStepChange={setStep} /><section className="rounded border border-[#dfe0d5] bg-[#fffdf8] shadow-[0_14px_40px_rgba(24,61,59,.05)]"><div className="border-b border-[#edf1ec] px-8 py-7 max-[600px]:px-5"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">Step {step + 1} of {admissionSteps.length}</p><div className="flex items-end justify-between gap-5"><div><h1 className="m-0 font-[400_32px_Georgia,serif] tracking-[-.04em]">{admissionSteps[step]}</h1><p className="mt-2 mb-0 text-[12px] text-[#82908c]">{descriptions[step]}</p></div><span className="text-[10px] text-[#82908c]">{savedAt}</span></div></div><form onSubmit={handleSubmit}><div className="grid gap-6 px-8 py-8 max-[600px]:px-5"><AdmissionStepContent step={step} form={form} errors={errors} documents={documents} onChange={handleChange} onDocumentsChange={handleDocumentChange} /></div><div className="admission-actions flex items-center justify-between border-t border-[#edf1ec] px-8 py-5 max-[600px]:flex-col-reverse max-[600px]:items-stretch max-[600px]:gap-3 max-[600px]:px-5"><button className="border-0 bg-transparent px-0 py-3 text-left text-[11px] text-[#82908c] disabled:opacity-40" disabled={step === 0 || isSubmitting} onClick={previousStep} type="button">← Back</button><div className="flex items-center gap-3 max-[600px]:flex-col-reverse"><button className="rounded border border-[#b9cbc3] bg-transparent px-4 py-3 text-[11px] font-semibold text-[#26766d]" disabled={isSubmitting} onClick={saveDraft} type="button">Save draft</button>{step === 5 && <button className="rounded border border-[#b9cbc3] bg-transparent px-4 py-3 text-[11px] font-semibold text-[#26766d]" onClick={() => window.print()} type="button">Print filled form</button>}{step < admissionSteps.length - 1 ? <button className="rounded border-0 bg-[#183d3b] px-5 py-3 text-[11px] font-semibold text-white" onClick={nextStep} type="button">Continue <span>→</span></button> : <button className="rounded border-0 bg-[#168b81] px-5 py-3 text-[11px] font-semibold text-white disabled:opacity-60" disabled={isSubmitting} type="submit">{isSubmitting ? "Submitting application..." : "Submit application"}</button>}</div></div></form></section></div></main>;
}
