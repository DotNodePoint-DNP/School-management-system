"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { isRole, roleDetails, type Role } from "@/core/authorization/roles";
import { resetPassword } from "@/modules/auth/services/auth-service";
import { validateNewPassword } from "@/modules/auth/validation";
import { toast } from "sonner";

export function ResetPassword({
  role: initialRole,
  token = "demo-reset-token",
}: {
  role?: string;
  token?: string;
}) {
  const role: Role = initialRole && isRole(initialRole) ? initialRole : "parent";
  const detail = roleDetails[role];
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setError(passwordError);
      toast.error(passwordError);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      toast.error("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword({ token, password, role });
      setIsComplete(true);
      toast.success("Your password has been updated.");
    } catch {
      const message = "This reset link is invalid or has expired. Request a new one.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f4f0e8] px-[7vw] text-[#183d3b] max-[700px]:px-[22px]">
      <div className="py-8">
        <Link className="inline-flex items-center gap-2 text-[#183d3b] no-underline" href="/">
          <span className="grid h-[30px] w-[30px] rotate-[-10deg] place-items-center rounded-[50%_50%_50%_4px] bg-[#edbd63] font-[700_20px_Georgia,serif]">n</span>
          <span className="[&_strong]:block [&_strong]:font-[600_16px_Georgia,serif] [&_small]:mt-0.5 [&_small]:block [&_small]:text-[8px] [&_small]:uppercase [&_small]:tracking-[.2em] [&_small]:text-[#71817e]">
            <strong>Pathivara</strong><small>Academy</small>
          </span>
        </Link>
      </div>
      <section className="mx-auto grid w-full max-w-[950px] flex-1 grid-cols-[.9fr_1.1fr] items-center gap-[clamp(55px,10vw,135px)] py-[45px] pb-[100px] max-[700px]:block max-[700px]:py-[30px] max-[700px]:pb-[60px]">
        <div className="max-[700px]:mb-10">
          <Link className="mb-[34px] inline-block text-[10px] text-[#6d817b] no-underline" href={`/auth/forgot-password?role=${role}`}>
            ← Request a new reset link
          </Link>
          <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[#d5ebe3] text-[24px] text-[#167d72]">✓</span>
          <p className="mb-4 text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">Secure account recovery</p>
          <h1 className="m-0 mt-[22px] mb-[18px] font-[400_clamp(53px,6vw,80px)/.9_Georgia,serif] tracking-[-.07em]">Choose a<br /><em className="text-[#bc8748]">new key.</em></h1>
          <p className="max-w-[270px] text-[12px] leading-[1.65] text-[#70817c]">Create a new password for your {detail.label.toLowerCase()} workspace.</p>
        </div>
        <div className="rounded border border-[#dfe0d5] bg-[#fffdf8] p-10 shadow-[0_15px_40px_rgba(24,61,59,.06)] max-[700px]:p-[30px_24px]">
          <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">{detail.label} workspace</div>
          <h2 className="mt-[18px] mb-2 font-[400_30px_Georgia,serif] tracking-[-.04em]">Set a new password</h2>
          {isComplete ? (
            <div className="rounded border border-[#b8ddca] bg-[#e3f1e8] p-[14px] text-[11px] leading-[1.6] text-[#317968]" role="status">
              Your password has been updated. <Link className="font-semibold underline" href={`/auth/login/${role}`}>Return to sign in</Link>.
            </div>
          ) : (
            <form className="grid gap-[18px]" onSubmit={handleSubmit}>
              <p className="mb-1 text-[11px] leading-[1.6] text-[#89958f]">Use at least 8 characters. Avoid reusing a password from another account.</p>
              <label className="block text-[10px] font-semibold text-[#4e6963]">New password<input className="mt-2 box-border block w-full rounded border border-[#dfe2d8] bg-[#f8f7f0] p-[13px_12px] text-[11px] text-[#183d3b] outline-none focus:border-[#6a9a8c]" autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
              <label className="block text-[10px] font-semibold text-[#4e6963]">Confirm new password<input className="mt-2 box-border block w-full rounded border border-[#dfe2d8] bg-[#f8f7f0] p-[13px_12px] text-[11px] text-[#183d3b] outline-none focus:border-[#6a9a8c]" autoComplete="new-password" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
              {error && <p className="m-0 text-[10px] leading-[1.5] text-[#b45e4f]" role="alert">{error}</p>}
              <button className="w-full rounded border-0 bg-[#183d3b] p-[14px] text-[11px] font-semibold text-[#f7f0e4] disabled:cursor-wait disabled:opacity-65" disabled={isSubmitting} type="submit">{isSubmitting ? "Updating password..." : "Update password"}</button>
            </form>
          )}
        </div>
      </section>
      <div className="flex items-center justify-between border-t border-[#d9dbd0] py-[18px] pb-6 text-[9px] text-[#87938e]"><span>Pathivara vidhya mandir</span><span>Secure school portal</span><Link href="/auth">Choose another workspace</Link></div>
    </main>
  );
}
