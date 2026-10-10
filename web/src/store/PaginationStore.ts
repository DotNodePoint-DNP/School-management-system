import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * One store for every table in the ERP, keyed by a tableId such as
 * "mark-entry", "students", "fees". Page size is remembered per table
 * (persisted); the current page is not.
 */
interface PaginationStore {
  pages: Record<string, number>;
  pageSizes: Record<string, number>;
  setPage: (id: string, page: number) => void;
  setPageSize: (id: string, size: number) => void;
  resetPage: (id: string) => void;
}

export const usePaginationStore = create<PaginationStore>()(
  persist(
    (set) => ({
      pages: {},
      pageSizes: {},
      setPage: (id, page) => set((s) => ({ pages: { ...s.pages, [id]: page } })),
      setPageSize: (id, size) =>
        set((s) => ({ pageSizes: { ...s.pageSizes, [id]: size }, pages: { ...s.pages, [id]: 1 } })),
      resetPage: (id) =>
        set((s) => (s.pages[id] === undefined || s.pages[id] === 1 ? s : { pages: { ...s.pages, [id]: 1 } })),
    }),
    { name: "erp-pagination", partialize: (s) => ({ pageSizes: s.pageSizes }) }
  )
);