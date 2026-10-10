import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

export interface PagedSearchParams {
  page: number;
  /** Current value of a URL param, or `null`. */
  get: (name: string) => string | null;
  /** Set (or clear with `null`/empty) a filter; resets to page 1. */
  setFilter: (name: string, value: string | null) => void;
  /** Go to a page (page 1 removes the param) and scroll to the top. */
  setPage: (page: number) => void;
  /** Remove every filter and the page. */
  clear: () => void;
}

/** Filters and the page number kept in the URL, so lists are shareable and survive reloads. */
export function usePagedSearchParams(): PagedSearchParams {
  const [searchParams, setSearchParams] = useSearchParams();

  const get = useCallback((name: string) => searchParams.get(name), [searchParams]);

  const setFilter = useCallback(
    (name: string, value: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(name, value);
        else next.delete(name);
        next.delete('page');
        return next;
      });
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (page: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (page > 1) next.set('page', String(page));
        else next.delete('page');
        return next;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setSearchParams],
  );

  const clear = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams]);

  return { page: parsePage(searchParams.get('page')), get, setFilter, setPage, clear };
}
