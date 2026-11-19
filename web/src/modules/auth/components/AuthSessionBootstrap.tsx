"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CurrentUser } from "@/core/authorization/roles";
import { accessDeniedEvent, ApiClientError } from "@/lib/api/client";
import { getAuthenticatedUser } from "@/modules/auth/services/auth-service";
import { useAuthStore } from "@/modules/auth/store/auth-store";

function accessSnapshot(user: CurrentUser) {
  return JSON.stringify([
    user.id,
    user.mustChangePassword,
    [...user.roles].sort(),
    [...user.permissions].sort(),
  ]);
}

export function AuthSessionBootstrap({ user }: { user: CurrentUser }) {
  const refresh = useAuthStore((state) => state.refresh);
  const queries = useQueryClient();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let pending = false;
    async function check(initial: boolean) {
      if (pending) return;
      pending = true;
      try {
        let needsRefresh = initial;
        if (!initial) {
          try {
            needsRefresh =
              accessSnapshot(await getAuthenticatedUser()) !==
              accessSnapshot(user);
          } catch (cause) {
            if (!(cause instanceof ApiClientError) || cause.status !== 401)
              throw cause;
            needsRefresh = true;
          }
        }
        if (active && needsRefresh) {
          const session = await refresh();
          if (active && accessSnapshot(session.user) !== accessSnapshot(user)) {
            queries.clear();
            window.location.reload();
          }
        }
        if (active) setError("");
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiClientError && cause.status === 401) {
          queries.clear();
          window.location.replace("/auth");
        } else {
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to verify your session.",
          );
        }
      } finally {
        pending = false;
      }
    }
    const recheck = () => {
      if (!document.hidden) void check(false);
    };
    void check(true);
    const interval = window.setInterval(recheck, 60000);
    window.addEventListener("focus", recheck);
    window.addEventListener(accessDeniedEvent, recheck);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", recheck);
      window.removeEventListener(accessDeniedEvent, recheck);
    };
  }, [attempt, queries, refresh, user]);

  return error ? (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 rounded border border-line bg-panel p-4 text-sm text-ink"
    >
      {error}{" "}
      <button
        type="button"
        className="underline"
        onClick={() => setAttempt((value) => value + 1)}
      >
        Retry
      </button>
    </div>
  ) : null;
}
