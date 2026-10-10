import { useCallback } from "react";
import { usePaginationStore } from "../../store/PaginationStore";

export const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export interface UsePaginationOptions {
  defaultPageSize?: number;
  pageSizes?: number[];
}

export function usePagination(
  tableId: string,
  totalItems: number,
  opts: UsePaginationOptions = {},
) {
  const defaultPageSize = opts.defaultPageSize ?? 25;
  const pageSizes = opts.pageSizes ?? DEFAULT_PAGE_SIZES;

  const rawPage = usePaginationStore((s) => s.pages[tableId]) ?? 1;
  const pageSize =
    usePaginationStore((s) => s.pageSizes[tableId]) ?? defaultPageSize;
  const setPageRaw = usePaginationStore((s) => s.setPage);
  const setPageSizeRaw = usePaginationStore((s) => s.setPageSize);
  const resetRaw = usePaginationStore((s) => s.resetPage);

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, rawPage), pageCount); // always clamped, even if the list shrinks
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  const setPage = useCallback(
    (p: number) => setPageRaw(tableId, Math.min(Math.max(1, p), pageCount)),
    [setPageRaw, tableId, pageCount],
  );
  const next = useCallback(() => setPage(page + 1), [setPage, page]);
  const prev = useCallback(() => setPage(page - 1), [setPage, page]);
  const setPageSize = useCallback(
    (n: number) => setPageSizeRaw(tableId, n),
    [setPageSizeRaw, tableId],
  );
  const reset = useCallback(() => resetRaw(tableId), [resetRaw, tableId]);
  const slice = useCallback(
    <T>(items: T[]) => items.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize],
  );

  return {
    page,
    pageSize,
    pageSizes,
    pageCount,
    total: totalItems,
    from,
    to,
    setPage,
    next,
    prev,
    setPageSize,
    reset,
    slice,
  };
}

export type PaginationState = ReturnType<typeof usePagination>;

/** [1, "…", 4, 5, 6, "…", 12] */
export function getPageItems(
  page: number,
  pageCount: number,
): (number | "…")[] {
  const keep = new Set(
    [1, pageCount, page - 1, page, page + 1].filter(
      (p) => p >= 1 && p <= pageCount,
    ),
  );
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}
