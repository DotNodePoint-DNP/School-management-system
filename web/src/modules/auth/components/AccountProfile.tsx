"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Failure, Field, inputClass, panelClass, primaryClass } from "@/components/ui/WorkspaceFields";
import { getAuthenticatedUser, saveProfile } from "../services/auth-service";
import { useAuthStore } from "../store/auth-store";

const profileKey = ["account", "me"];

export function AccountProfile() {
  const router = useRouter();
  const cache = useQueryClient();
  const profile = useQuery({ queryKey: profileKey, queryFn: getAuthenticatedUser });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess(user) {
      cache.setQueryData(profileKey, user);
      useAuthStore.setState({ user });
      setDraft(null);
      router.refresh();
      toast.success("Profile updated.");
    },
  });
  const user = profile.data;
  const name = draft ?? user?.fullName ?? "";

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-ink">Account settings</h1>
      {profile.isPending && <p role="status" className="text-muted">Loading your profile…</p>}
      <Failure error={profile.error} retry={() => void profile.refetch()} />
      {user && (
        <form className={panelClass + " space-y-5"} onSubmit={event => {
          event.preventDefault();
          if (!save.isPending && name.trim().length >= 2) save.mutate(name.trim());
        }}>
          <h2 className="text-lg font-semibold">My profile</h2>
          <Field label="Full name">
            <input className={inputClass} autoComplete="name" value={name} required minLength={2}
              maxLength={120} disabled={save.isPending} onChange={event => setDraft(event.target.value)} />
          </Field>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">Email</dt><dd className="break-words">{user.email ?? "No email on file"}</dd></div>
            <div><dt className="text-muted">Phone</dt><dd>{user.phone ?? "No phone on file"}</dd></div>
            <div><dt className="text-muted">Roles</dt><dd>{user.roles.join(", ") || "No roles assigned"}</dd></div>
          </dl>
          <Failure error={save.error} />
          <button type="submit" className={primaryClass}
            disabled={save.isPending || name.trim().length < 2 || name.trim() === user.fullName}>
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
      <Link className="inline-block font-semibold text-teal underline" href="/auth/change-password">
        Change password
      </Link>
    </section>
  );
}
