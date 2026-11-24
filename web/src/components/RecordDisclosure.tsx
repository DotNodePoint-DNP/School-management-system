"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RecordDetails } from "./RecordDetails";

export function RecordDisclosure({
  label,
  queryKey,
  load,
}: {
  label: string;
  queryKey: readonly unknown[];
  load: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const request = useQuery({ queryKey, queryFn: load, enabled: open });
  return (
    <div className="min-w-0 print:hidden">
      <button
        type="button"
        aria-expanded={open}
        className="min-h-10 text-sm font-semibold text-teal underline"
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide · " : ""}
        {label}
      </button>
      {open && (
        <div className="my-2 rounded-lg border border-line bg-panel p-3">
          {request.isPending ? (
            <p>Loading…</p>
          ) : request.error ? (
            <div role="alert">
              {request.error.message}{" "}
              <button
                className="underline"
                onClick={() => void request.refetch()}
              >
                Retry
              </button>
            </div>
          ) : (
            <RecordDetails value={request.data} />
          )}
        </div>
      )}
    </div>
  );
}
