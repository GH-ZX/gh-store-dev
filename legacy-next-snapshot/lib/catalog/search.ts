import { z } from "zod";

export const SEARCH_FILTERS = ["all", "topup", "gift_card", "offers"] as const;

export type SearchFilter = (typeof SEARCH_FILTERS)[number];

export const SEARCH_QUERY_MAX_LENGTH = 80;
const MAX_TOKENS = 5;
const MAX_TOKEN_LENGTH = 32;

/**
 * An over-long query is truncated rather than rejected, so pasting a paragraph
 * into the search box still searches its opening words.
 */
const searchParamsSchema = z.object({
  q: z.string().optional(),
  type: z.string().optional(),
});

export type ParsedSearchParams = {
  query: string;
  filter: SearchFilter;
};

export function parseSearchFilter(value: unknown): SearchFilter {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  return SEARCH_FILTERS.includes(normalized as SearchFilter) ? (normalized as SearchFilter) : "all";
}

/**
 * Validate the untrusted `?q=&type=` pair from the URL.
 *
 * Anything unparseable degrades to an empty query on the `all` filter rather
 * than failing the request, because a bad search URL is not an error page.
 */
export function parseSearchParams(input: unknown): ParsedSearchParams {
  const parsed = searchParamsSchema.safeParse(input ?? {});

  if (!parsed.success) {
    return { query: "", filter: "all" };
  }

  return {
    query: (parsed.data.q ?? "").trim().slice(0, SEARCH_QUERY_MAX_LENGTH),
    filter: parseSearchFilter(parsed.data.type),
  };
}

/**
 * Split a query into safe match tokens.
 *
 * PostgREST parses `or=(...)` filters as CSV, so characters that would break
 * out of a filter group — commas, parentheses, quotes, backslashes — and LIKE
 * wildcards are removed rather than escaped.
 */
export function toSearchTokens(query: string): string[] {
  const cleaned = query
    .toLowerCase()
    .replace(/[,()"'\\%_*]/g, " ")
    .trim();

  if (!cleaned) {
    return [];
  }

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.slice(0, MAX_TOKEN_LENGTH))
    .filter((token) => token.length > 0);

  return Array.from(new Set(tokens)).slice(0, MAX_TOKENS);
}

export function buildSearchPath(locale: string, params: Partial<ParsedSearchParams>): string {
  const search = new URLSearchParams();
  const query = (params.query ?? "").trim();

  if (query) {
    search.set("q", query);
  }

  const filter = parseSearchFilter(params.filter);

  if (filter !== "all") {
    search.set("type", filter);
  }

  const queryString = search.toString();

  return queryString ? `/${locale}/search?${queryString}` : `/${locale}/search`;
}
