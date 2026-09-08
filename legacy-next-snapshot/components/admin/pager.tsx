import Link from "next/link";
import { ArrowIcon } from "@/components/ui/icons";
import { formatMessage } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";

/**
 * Previous and next, for any paged list in the dashboard.
 *
 * Both ends are links, so paging survives a page reload and a shared URL. An end
 * that cannot be reached renders as inert text rather than a link to nowhere —
 * a disabled-looking control that still navigates is worse than no control.
 *
 * The caller supplies `hrefFor` rather than the list's own filter state. This
 * began life knowing about log views and levels, which meant the support queue
 * could not have used it without teaching it a second vocabulary; a function
 * from page number to URL is the only thing a pager actually needs.
 *
 * The total is optional because Axiom's is: that count is a second query allowed
 * to fail on its own, and when it does the pager says which page you are on
 * without claiming how many there are. Better to say less than to say a number
 * that might be wrong.
 */

export type PagerLabels = {
  previous: string;
  next: string;
  /** "Page {page} of {pages}" */
  position: string;
  /** "Page {page}" — used when the total is unknown. */
  positionUnknown: string;
  navLabel: string;
};

const STEP =
  "inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-4 text-xs font-semibold text-[var(--ink)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)]";
const STEP_OFF =
  "inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-transparent px-4 text-xs font-semibold text-[var(--ink-faint)]";

export function Pager({
  locale,
  hrefFor,
  page,
  pages,
  hasMore = false,
  labels,
}: {
  locale: Locale;
  /** Where a given page number lives, filters and all. */
  hrefFor: (page: number) => string;
  page: number;
  /** Null when the total could not be determined. */
  pages: number | null;
  /** Only consulted when `pages` is null. */
  hasMore?: boolean;
  labels: PagerLabels;
}) {
  const hasPrevious = page > 1;
  const hasNext = pages === null ? hasMore : page < pages;

  // A list that fits on one page does not need controls at all.
  if (!hasPrevious && !hasNext) {
    return null;
  }

  const position =
    pages === null
      ? formatMessage(labels.positionUnknown, { page }, locale)
      : formatMessage(labels.position, { page, pages }, locale);

  return (
    <nav className="flex items-center justify-between gap-3" aria-label={labels.navLabel}>
      {hasPrevious ? (
        <Link href={hrefFor(page - 1)} rel="prev" prefetch={false} className={STEP}>
          <ArrowIcon direction="start" className="size-3.5 rtl:rotate-180" aria-hidden="true" />
          {labels.previous}
        </Link>
      ) : (
        <span className={STEP_OFF} aria-hidden="true">
          <ArrowIcon direction="start" className="size-3.5 rtl:rotate-180" />
          {labels.previous}
        </span>
      )}

      <p className="text-xs text-[var(--ink-muted)] tabular-nums">{position}</p>

      {hasNext ? (
        <Link href={hrefFor(page + 1)} rel="next" prefetch={false} className={STEP}>
          {labels.next}
          <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" aria-hidden="true" />
        </Link>
      ) : (
        <span className={STEP_OFF} aria-hidden="true">
          {labels.next}
          <ArrowIcon direction="end" className="size-3.5 rtl:rotate-180" />
        </span>
      )}
    </nav>
  );
}
