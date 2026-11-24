import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listGuardians, type GuardianSummary } from "./services/guardians";

export function GuardianPicker({ exclude, onSelect }: { exclude: string[]; onSelect: (guardian: GuardianSummary) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["guardians", "picker", search, page],
    queryFn: () => listGuardians({ search, page, pageSize: 12 }),
  });
  return <div className="space-y-2 rounded-lg border border-line p-3">
    <label>Find existing guardian <input className="rounded border border-line px-2" value={search}
      onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Name or contact" /></label>
    {query.isError && <p role="alert">{query.error.message}</p>}
    {query.isPending ? <p>Loading guardians…</p> : <select className="w-full rounded border border-line p-2" aria-label="Select existing guardian" value="" onChange={event => {
      const guardian = query.data?.items.find(item => item.id === event.target.value);
      if (guardian) onSelect(guardian);
    }}>
      <option value="">Select guardian</option>
      {query.data?.items.map(g => <option key={g.id} value={g.id} disabled={exclude.includes(g.id)}>
        {[g.firstName, g.middleName, g.lastName].filter(Boolean).join(" ")} · {g.phone ?? g.email}
      </option>)}
    </select>}
    <div className="flex gap-3 text-sm">
      <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page}</span>
      <button type="button" disabled={page >= (query.data?.meta.totalPages ?? 0)} onClick={() => setPage(page + 1)}>Next</button>
    </div>
  </div>;
}
