"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/modules/auth/store/auth-store";

export function AuthSessionBootstrap() {
  const refresh = useAuthStore((state) => state.refresh);
  const [error, setError] = useState("");

  async function retryRefresh() {
    setError("");
    await refresh().catch((cause: unknown) => {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your session could not be refreshed.",
      );
    });
  }

  useEffect(() => {
    let active = true;
    void refresh().catch((cause: unknown) => {
      if (active) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Your session could not be refreshed.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  if (!error) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded border border-[#e8c5bd] bg-[#fffdf8] p-4 text-sm text-[#8d4135] shadow-lg"
      role="alert"
    >
      <p>{error}</p>
      <button
        className="mt-2 font-semibold underline"
        onClick={() => void retryRefresh()}
        type="button"
      >
        Retry session
      </button>
    </div>
  );
}
