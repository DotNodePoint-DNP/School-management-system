"use client";

import {
  getPageItems,
  type PaginationState,
} from "@/features/pagination/Usepagination";

const btn =
  "h-9 min-w-9 rounded-lg px-2 text-sm text-ink transition-colors hover:bg-mint disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal";

export function Pagination({ pg }: { pg: PaginationState }) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
    >
      <p aria-live="polite">
        {pg.total === 0
          ? "No rows"
          : `Showing ${pg.from}–${pg.to} of ${pg.total}`}
      </p>

      <div className="flex items-center gap-1">
        {pg.pageCount > 1 && (
          <>
            <button
              type="button"
              className={btn}
              onClick={pg.prev}
              disabled={pg.page === 1}
              aria-label="Previous page"
            >
              Prev
            </button>
            {getPageItems(pg.page, pg.pageCount).map((it, i) =>
              it === "…" ? (
                <span key={`gap-${i}`} className="px-1">
                  …
                </span>
              ) : (
                <button
                  key={it}
                  type="button"
                  onClick={() => pg.setPage(it)}
                  aria-current={it === pg.page ? "page" : undefined}
                  className={`${btn} ${it === pg.page ? "bg-navy text-white hover:bg-navy" : ""}`}
                >
                  {it}
                </button>
              ),
            )}
            <button
              type="button"
              className={btn}
              onClick={pg.next}
              disabled={pg.page === pg.pageCount}
              aria-label="Next page"
            >
              Next
            </button>
          </>
        )}
      </div>

      <label className="flex items-center gap-2">
        Rows per page
        <select
          value={pg.pageSize}
          onChange={(e) => pg.setPageSize(Number(e.target.value))}
          className="h-9 rounded-lg border border-line bg-panel px-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
        >
          {pg.pageSizes.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}
