"use client";

import { useQuery } from "@tanstack/react-query";
import { RecordDetails } from "@/components/RecordDetails";
import { Failure, panelClass } from "@/components/ui/WorkspaceFields";
import { familyAccount, familyFees } from "./services/portal";

export function FamilyRecordSection({
  section,
}: {
  section: "balance" | "account";
}) {
  const balance = section === "balance";
  const query = useQuery({
    queryKey: ["family", balance ? "fees" : "account"],
    queryFn: balance ? familyFees : familyAccount,
  });
  return (
    <section className="mx-auto max-w-5xl space-y-6 p-4 text-ink sm:p-6">
      <h1 className="text-3xl font-semibold">
        {balance ? "Family balance" : "Account"}
      </h1>
      <div className={panelClass}>
        <Failure error={query.error} retry={() => void query.refetch()} />
        {query.isPending && <p role="status">Loading&hellip;</p>}
        {query.data && <RecordDetails value={query.data} />}
      </div>
    </section>
  );
}
