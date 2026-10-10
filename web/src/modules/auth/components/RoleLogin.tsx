"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { roleDetails, type Role } from "@/core/authorization/roles";
import { useAuthStore } from "@/modules/auth/store/auth-store";
import { establishMockSession } from "@/modules/auth/services/auth-service";
import { validateIdentifier, validateLoginPassword } from "@/modules/auth/validation";
import { toast } from "sonner";

export function RoleLogin({ role }: { role: Role }) {
  const detail = roleDetails[role];
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    const validationError = validateIdentifier(identifier) ?? validateLoginPassword(password);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      setIsSubmitting(false);
      return;
    }
    try {
      const result = await signIn({
        identifier,
        password,
        role,
      });
      await establishMockSession(result.user);
      toast.success("Signed in successfully. Opening your workspace...");
      router.push(`/dashboard?role=${role}`);
    } catch {
      const message = "We could not sign you in with those details. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const accent =
    detail.accent === "teal"
      ? "bg-[#d5ebe3] text-[#167d72]"
      : detail.accent === "navy"
        ? "bg-[#dce6e4] text-[#315a5b]"
        : detail.accent === "amber"
          ? "bg-[#f9e7bd] text-[#ae792b]"
          : "bg-[#f5dcd2] text-[#b36a58]";

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
      <section className="mx-auto grid w-full max-w-[950px] flex-1 grid-cols-[.8fr_1.2fr] items-center gap-[clamp(60px,11vw,150px)] py-[30px] pb-[90px] max-[700px]:block max-[700px]:py-[30px] max-[700px]:pb-[60px]">
        <div className="max-[700px]:mb-10">
          <Link
            className="mb-[45px] inline-block text-[10px] text-[#6d817b] no-underline max-[700px]:mb-[35px]"
            href="/auth"
          >
            ← Change workspace
          </Link>
          <span
            className={`mt-[5px] grid h-[58px] w-[58px] place-items-center rounded-full text-[23px] ${accent}`}
          >
            <span
              aria-hidden="true"
              className="text-current [&_svg]:h-[30px] [&_svg]:w-[30px] [&_svg]:fill-none"
              dangerouslySetInnerHTML={{ __html: detail.icon }}
            />
          </span>
          <p className="mb-4 text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">
            {detail.label} workspace
          </p>
          <h1 className="m-0 mt-[22px] mb-[18px] font-[400_clamp(56px,6vw,84px)/.86_Georgia,serif] tracking-[-.07em]">
            Welcome
            <br />
            <em className="text-[#bc8748]">back.</em>
          </h1>
          <p className="max-w-[225px] text-[12px] leading-[1.65] text-[#70817c]">
            {detail.description}
          </p>
          <div className="mt-10 flex max-w-[230px] items-center gap-[9px] border-t border-[#d8dad0] pt-[13px] text-[9px] leading-[1.5] text-[#8a9691]">
            <span className="text-[#bd8847]">✦</span>
            <small>
              Your access is scoped to your school role and permissions.
            </small>
          </div>
        </div>
        <div className="rounded border border-[#dfe0d5] bg-[#fffdf8] p-10 shadow-[0_15px_40px_rgba(24,61,59,.06)] max-[700px]:p-[30px_24px]">
          <div className="mb-7 flex justify-center">
            <span
              aria-label="Pathivara logo"
              className="grid h-14 w-14 rotate-[-8deg] place-items-center rounded-full bg-[#183d3b] text-[32px] font-bold text-[#edbd63] shadow-[0_6px_14px_rgba(24,61,59,.16)]"
            >
              n
            </span>
          </div>
          <div className="text-center text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">
            Sign in as {detail.label}
          </div>
          <h2 className="mt-[18px] mb-2 font-[400_31px_Georgia,serif] tracking-[-.04em]">
            Your workspace awaits.
          </h2>
          <p className="mb-[30px] text-[11px] text-[#89958f]">
            Use your email address or phone number to continue.
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
            <label className="block text-[10px] font-semibold text-[#4e6963]">
              Password
              <Link
                className="float-right text-[9px] font-normal text-[#b27b3d] underline-offset-[3px]"
                href={`/auth/forgot-password?role=${role}`}
              >
                Forgot password?
              </Link>
              <div className="relative mt-2">
                <input
                  className="box-border block w-full rounded border border-[#dfe2d8] bg-[#f8f7f0] p-[13px_40px_13px_12px] text-[11px] text-[#183d3b] outline-none focus:border-[#6a9a8c]"
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-3 flex items-center justify-center border-0 bg-transparent p-0 text-[#6d817b] transition hover:text-[#183d3b]"
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  {showPassword ? (
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58A2 2 0 0013.42 13.42" />
                      <path d="M9.88 5.08A10.94 10.94 0 0112 5c4.97 0 9 4.35 9 7a12.45 12.45 0 01-3.48 5.04M6.46 6.46A12.31 12.31 0 003 12c0 2.65 4.03 7 9 7a11.7 11.7 0 005.54-1.46" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                    >
                      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            {error && (
              <p
                className="m-0 text-[10px] leading-[1.5] text-[#b45e4f]"
                role="alert"
              >
                {error}
              </p>
            )}
            <button
              className="mt-2 w-full rounded border-0 bg-[#183d3b] p-[14px] text-left text-[11px] font-semibold text-[#f7f0e4] disabled:cursor-wait disabled:opacity-65"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Connecting..." : "Continue to portal"}{" "}
              <span>→</span>
            </button>
          </form>
          <p className="mt-[23px] text-[9px] leading-[1.5] text-[#a2aaa4]">
            By continuing, you agree to Pathivara&apos;s portal terms and
            privacy policy.
          </p>
        </div>
      </section>
      <div className="flex items-center justify-between border-t border-[#d9dbd0] py-[18px] pb-6 text-[9px] text-[#87938e] max-[700px]:flex-wrap max-[700px]:gap-3 max-[700px]:[&>span:nth-child(2)]:hidden">
        <span>Pathivara vidhya mandir</span>
        <span>Secure school portal</span>
        <Link href="/">Back to website ↗</Link>
      </div>
    </main>
  );
}
