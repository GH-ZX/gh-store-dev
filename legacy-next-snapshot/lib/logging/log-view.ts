import type { Locale } from "@/i18n/config";
import { parsePage } from "@/lib/paging";

/**
 * What the Logs page is currently showing.
 *
 * All of it lives in the query string rather than in component state, which is
 * what lets the page stay a server component: a tab, a page number and a level
 * filter are links, so the whole thing works with JavaScript switched off and a
 * particular view can be pasted to someone else.
 *
 * Kept free of `server-only` so the test runner can load it — the same
 * constraint that put {@link import("./fields").hasContent} in its own module.
 */

export const LOG_VIEWS = ["events", "actions", "syncs"] as const;
export type LogView = (typeof LOG_VIEWS)[number];

/**
 * Which levels the events view asks Axiom for.
 *
 * `problems` is the default because the page's first job is still "is anything
 * wrong right now". `all` exists because that question is not the only one: with
 * instrumentation being added, "did this event actually arrive?" is answerable
 * only by looking at the levels a problems-only filter hides.
 */
export const LOG_LEVEL_FILTERS = ["problems", "all", "error"] as const;
export type LogLevelFilter = (typeof LOG_LEVEL_FILTERS)[number];

export const DEFAULT_VIEW: LogView = "events";
export const DEFAULT_LEVEL: LogLevelFilter = "problems";

/**
 * How deep paging is allowed to go.
 *
 * Axiom's query language has no `OFFSET`, so page N is reached by asking for
 * `N * PAGE_SIZE` rows and throwing away the ones before the window. That cost
 * grows with the page number, so it needs a ceiling; past it, Axiom's own
 * console is the right tool anyway.
 */
export const MAX_PAGE = 25;

export type LogViewParams = {
  view: LogView;
  page: number;
  level: LogLevelFilter;
};

type QueryValue = string | string[] | undefined;
type Query = Record<string, QueryValue>;

/** `?a=1&a=2` arrives as an array; the first value is as good an answer as any. */
function first(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(value: QueryValue, allowed: readonly T[], fallback: T): T {
  const candidate = first(value)?.trim().toLowerCase();

  return (allowed as readonly string[]).includes(candidate ?? "") ? (candidate as T) : fallback;
}

/**
 * Read the view out of the URL, treating anything unrecognised as the default.
 *
 * A hand-edited or stale URL is a normal thing to receive and must never be able
 * to throw: `?page=-4`, `?page=abc` and `?view=nonsense` all resolve to a page
 * that renders.
 */
export function parseLogView(query: Query = {}): LogViewParams {
  return {
    view: oneOf(query.view, LOG_VIEWS, DEFAULT_VIEW),
    page: parsePage(query.page, MAX_PAGE),
    level: oneOf(query.level, LOG_LEVEL_FILTERS, DEFAULT_LEVEL),
  };
}

/**
 * A link to some other view of this page.
 *
 * Defaults are left out of the query string so the common URL is the bare path,
 * and so a tab link does not carry a page number from the tab you were on — page
 * 3 of the audit log says nothing about where to open the sync runs.
 */
export function logHref({
  locale,
  view = DEFAULT_VIEW,
  page = 1,
  level = DEFAULT_LEVEL,
}: {
  locale: Locale;
  view?: LogView;
  page?: number;
  level?: LogLevelFilter;
}): string {
  const params = new URLSearchParams();

  if (view !== DEFAULT_VIEW) {
    params.set("view", view);
  }

  // The level filter only means anything to the events view.
  if (view === "events" && level !== DEFAULT_LEVEL) {
    params.set("level", level);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();

  return `/${locale}/dashboard/logs${query ? `?${query}` : ""}`;
}

