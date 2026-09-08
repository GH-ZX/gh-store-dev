import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { SearchMessages } from "@/i18n/messages";
import { buildSearchPath, SEARCH_FILTERS, type SearchFilter } from "@/lib/catalog/search";

/**
 * Result type filter.
 *
 * Real links rather than buttons: each filter is a distinct, shareable URL, and
 * the set works without JavaScript.
 */
export function SearchFilters({
  locale,
  query,
  filter,
  messages,
}: {
  locale: Locale;
  query: string;
  filter: SearchFilter;
  messages: SearchMessages;
}) {
  return (
    <nav aria-label={messages.filtersLabel} className="flex flex-wrap gap-2">
      {SEARCH_FILTERS.map((candidate) => {
        const isActive = candidate === filter;

        return (
          <Link
            key={candidate}
            href={buildSearchPath(locale, { query, filter: candidate })}
            aria-current={isActive ? "true" : undefined}
            className={
              isActive
                ? "inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-4 text-sm font-semibold text-[var(--accent-strong)]"
                : "inline-flex min-h-10 items-center rounded-[var(--radius-pill)] border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
            }
          >
            {messages.filters[candidate]}
          </Link>
        );
      })}
    </nav>
  );
}
