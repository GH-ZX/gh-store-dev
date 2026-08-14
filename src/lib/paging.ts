/**
 * Splitting a list into pages.
 *
 * Deliberately not tied to any one list. These began life inside the Logs page's
 * own module, which was fine while the logs were the only paged thing in the
 * store; the support queue is the second, and "import pagination from the
 * logging module" is the kind of seam that only ever gets worse.
 *
 * Pure and free of `server-only`, so both the services and the test runner can
 * load them.
 */

export const PAGE_SIZE = 20;

/** Always at least one page, so an empty list reads "1 of 1" rather than "1 of 0". */
export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** The Supabase `range()` window for a page, which is inclusive at both ends. */
export function pageRange(page: number, pageSize: number = PAGE_SIZE): { from: number; to: number } {
  const from = (page - 1) * pageSize;

  return { from, to: from + pageSize - 1 };
}

/**
 * Read a page number out of a query string.
 *
 * A hand-edited or stale URL is a normal thing to receive and must never throw:
 * `?page=-4`, `?page=abc` and `?page=` all resolve to page 1.
 */
export function parsePage(value: string | string[] | undefined, max: number): number {
  const first = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(first ?? "", 10);

  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), max) : 1;
}
