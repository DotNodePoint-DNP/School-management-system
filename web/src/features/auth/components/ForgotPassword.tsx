"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { roleDetails, isRole, type Role } from "@/core/authorization/roles";
import { requestPasswordReset } from "@/modules/auth/services/auth-service";
import { validateIdentifier } from "@/modules/auth/validation";
import { toast } from "sonner";

export function ForgotPassword({ role: initialRole }: { role?: string }) {
  const role: Role =
    initialRole && isRole(initialRole) ? initialRole : "parent";
  const detail = roleDetails[role];
  const [identifier, setIdentifier] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");
    const validationError = validateIdentifier(identifier);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      setIsSubmitting(false);
      return;
    }
    try {
      await requestPasswordReset({
        identifier,
        role,
      });
      setMessage(
        "If an account exists for this email or phone number, we will send reset instructions shortly.",
      );
      toast.success("Reset instructions requested. Check your email or phone shortly.");
    } catch {
      const message = "We could not connect to the portal service. Please try again shortly.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f4f0e8] px-[7vw] text-[#183d3b] max-[700px]:px-[22px]">
      <div className="py-8">
        <Link
          className="inline-flex items-center gap-2 text-[#183d3b] no-underline"
          href="/"
        >
          <span className="grid h-[30px] w-[30px] rotate-[-10deg] place-items-center rounded-[50%_50%_50%_4px] bg-[#edbd63] font-[700_20px_Georgia,serif]">
            n
          </span>
          <span className="[&_strong]:block [&_strong]:font-[600_16px_Georgia,serif] [&_small]:mt-0.5 [&_small]:block [&_small]:text-[8px] [&_small]:uppercase [&_small]:tracking-[.2em] [&_small]:text-[#71817e]">
            <strong>Pathivara</strong>
            <small>Academy</small>
          </span>
        </Link>
      </div>
      <section className="mx-auto grid w-full max-w-[950px] flex-1 grid-cols-[.9fr_1.1fr] items-center gap-[clamp(55px,10vw,135px)] py-[45px] pb-[100px] max-[700px]:block max-[700px]:py-[30px] max-[700px]:pb-[60px]">
        <div className="max-[700px]:mb-10">
          <Link
            className="mb-[34px] inline-block text-[10px] text-[#6d817b] no-underline"
            href={`/auth/login/${role}`}
          >
            ← Back to {detail.label} sign in
          </Link>
          <span className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[#f9e7bd] text-[24px] text-[#ae792b]">
            ?
          </span>
          <p className="mb-4 text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">
            Account recovery
          </p>
          <h1 className="m-0 mt-[22px] mb-[18px] font-[400_clamp(53px,6vw,80px)/.9_Georgia,serif] tracking-[-.07em]">
            Let&apos;s get
            <br />
            <em className="text-[#bc8748]">you back in.</em>
          </h1>
          <p className="max-w-[270px] text-[12px] leading-[1.65] text-[#70817c]">
            We&apos;ll send a secure, time-limited link to the email or phone
            number attached to your {detail.label.toLowerCase()} account.
          </p>
        </div>
        <div className="rounded border border-[#dfe0d5] bg-[#fffdf8] p-10 shadow-[0_15px_40px_rgba(24,61,59,.06)] max-[700px]:p-[30px_24px]">
          <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">
            {detail.label} workspace
          </div>
          <h2 className="mt-[18px] mb-2 font-[400_30px_Georgia,serif] tracking-[-.04em]">
            Reset your password
          </h2>
          <p className="mb-7 text-[11px] leading-[1.6] text-[#89958f]">
            Enter your email address or phone number and we&apos;ll take care of
            the rest. Your role remains scoped to{" "}
            <strong>{detail.label}</strong>.
          </p>
          <form className="grid gap-[18px]" onSubmit={handleSubmit}>
            <label className="block text-[10px] font-semibold text-[#4e6963]">
              Email or phone number
              <input
                className="mt-2 box-border block w-full rounded border border-[#dfe2d8] bg-[#f8f7f0] p-[13px_12px] text-[11px] text-[#183d3b] outline-none focus:border-[#6a9a8c]"
                autoComplete="username"
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="you@pathivara.example or +977 98..."
                required
                type="text"
                value={identifier}
              />
            </label>
            {error && (
              <p
                className="m-0 text-[10px] leading-[1.5] text-[#b45e4f]"
                role="alert"
              >
                {error}
              </p>
            )}
            {message && (
              <p
                className="m-0 rounded border border-[#b8ddca] bg-[#e3f1e8] p-[11px] text-[10px] leading-[1.5] text-[#317968]"
                role="status"
              >
                {message}
              </p>
            )}
            <button
              className="w-full rounded border-0 bg-[#183d3b] p-[14px] text-[11px] font-semibold text-[#f7f0e4] disabled:cursor-wait disabled:opacity-65"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? "Sending instructions..."
                : "Send reset instructions"}
            </button>
          </form>
          <p className="mt-[23px] text-[9px] leading-[1.5] text-[#a2aaa4]">
            For your security, we never reveal whether an email or phone number
            is registered.
          </p>
        </div>
      </section>
      <div className="flex items-center justify-between border-t border-[#d9dbd0] py-[18px] pb-6 text-[9px] text-[#87938e] max-[700px]:flex-wrap max-[700px]:gap-3 max-[700px]:[&>span:nth-child(2)]:hidden">
        <span>Pathivara vidhya mandir</span>
        <span>Secure school portal</span>
          <Link href="/auth">Choose another workspace</Link>
      </div>
    </main>
  );
}
