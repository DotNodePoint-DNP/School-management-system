"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { changePassword } from "@/modules/auth/services/auth-service";
import { validateNewPassword } from "@/modules/auth/validation";
import { toast } from "sonner";

export function ChangePassword() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword.length < 10) {
      setError("Your new password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      toast.success("Password updated. Sign in with your new password.");
      router.replace("/auth");
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Unable to change your password. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-[#f4f0e8] px-[7vw] text-[#183d3b] max-[700px]:px-[22px]">
      <div className="py-8">
        <Link className="text-[#183d3b] no-underline" href="/">
          Pathivara Academy
        </Link>
      </div>
      <section className="mx-auto my-auto w-full max-w-[480px] rounded border border-[#dfe0d5] bg-[#fffdf8] p-10 shadow-[0_15px_40px_rgba(24,61,59,.06)] max-[700px]:p-[30px_24px]">
        <p className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#b27b3d]">
          Secure your account
        </p>
        <h1 className="mt-4 font-[400_32px_Georgia,serif]">
          Change your password
        </h1>
        <p className="text-sm leading-relaxed text-[#70817c]">
          Your school requires a password change before you can continue.
        </p>
        <form className="mt-7 grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-xs font-semibold">
            Current password
            <input
              autoComplete="current-password"
              className="rounded border border-[#dfe2d8] bg-[#f8f7f0] p-3 text-sm"
              maxLength={128}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold">
            New password
            <input
              autoComplete="new-password"
              className="rounded border border-[#dfe2d8] bg-[#f8f7f0] p-3 text-sm"
              maxLength={128}
              minLength={10}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold">
            Confirm new password
            <input
              autoComplete="new-password"
              className="rounded border border-[#dfe2d8] bg-[#f8f7f0] p-3 text-sm"
              maxLength={128}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type="password"
              value={confirmation}
            />
          </label>
          {error && (
            <p className="m-0 text-sm text-[#b45e4f]" role="alert">
              {error}
            </p>
          )}
          <button
            className="mt-2 rounded border-0 bg-[#183d3b] p-3 text-sm font-semibold text-[#f7f0e4] disabled:cursor-wait disabled:opacity-65"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Updating password..." : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
