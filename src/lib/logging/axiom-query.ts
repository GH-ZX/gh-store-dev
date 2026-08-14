import "server-only";

import { hasContent, readCount } from "@/lib/logging/fields";
import { MAX_PAGE, type LogLevelFilter } from "@/lib/logging/log-view";
import { PAGE_SIZE } from "@/lib/paging";
import { readAxiomCredentials } from "@/lib/settings/axiom-settings";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * Read recent events back out of Axiom, for the dashboard.
 *
 * Axiom's own console is the place to investigate — it has the query language,
 * the dashboards and the alerts, and none of that is worth rebuilding here.
 * What the store's own Logs page owes an operator is narrower: what the store
 * has been saying, a page at a time, without leaving the dashboard to find out.
 *
 * The ingest token and the query token are the same stored token, but they are
 * not the same permission: a token created for ingest alone answers 403 here.
 * That is reported as its own state rather than as an empty list, because "no
 * errors" and "not allowed to look" must never render the same.
 */

export type AppEvent = {
  time: string;
  level: string;
  area: string;
  event: string;
  fields: Record<string, unknown>;
};

export type AppEventsResult =
  | {
      ok: true;
      events: AppEvent[];
      /** Null when the count query's answer was not in a shape we could read. */
      total: number | null;
      hasMore: boolean;
    }
  | { ok: false; reason: "not_configured" | "forbidden" | "unavailable" | "contract" };

type QueryFailure = { ok: false; reason: "forbidden" | "unavailable" | "contract" };
type QueryResult = { ok: true; body: Record<string, unknown> } | QueryFailure;

const QUERY_PATH = "/v1/datasets/_apl?format=legacy";
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The `where` each filter compiles to.
 *
 * Written out as constants and never built from request input: the level
 * arrives from the query string, and a string interpolated into APL is the same
 * hazard there as it is in SQL.
 *
 * `all` still carries a clause rather than none. The dataset holds rows written
 * before the ingest shape was corrected, whose level sits at `data.level` and
 * which this page has no way to render; excluding them here is what keeps the
 * total and the list agreeing about how many events there are.
 */
const LEVEL_CLAUSES: Record<LogLevelFilter, string> = {
  problems: "| where level in ('warn', 'error')",
  error: "| where level == 'error'",
  all: "| where isnotnull(level)",
};

/** The API host serves queries; an edge host does not. */
function queryUrl(domain: string): string {
  const host = domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const apiHost = /(^|\.)edge\.axiom\.co$/i.test(host) ? "api.axiom.co" : host;

  return `https://${apiHost}${QUERY_PATH}`;
}

function toEvent(raw: unknown): AppEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  // A legacy-format match carries the event under `data`; be tolerant of a
  // flattened row too, since only the ingest half of this contract is verified.
  const data = (row.data && typeof row.data === "object" ? row.data : row) as Record<string, unknown>;
  const { time, level, area, event, ...rest } = data;

  if (typeof level !== "string" || typeof area !== "string") {
    return null;
  }

  /*
   * Axiom returns every column the dataset has ever seen, nulled where this
   * event did not set it, so an event with three fields comes back with thirty.
   * Only what this event actually carried is worth showing.
   *
   * Emptiness has to be checked through nested objects, not just at the top:
   * a dataset keeps columns written by an earlier event shape, and those arrive
   * as an object of nothing but nulls rather than as a null.
   */
  const fields = Object.fromEntries(Object.entries(rest).filter(([, value]) => hasContent(value)));

  return {
    time: typeof time === "string" ? time : String(row._time ?? ""),
    level,
    area,
    event: typeof event === "string" ? event : "",
    fields,
  };
}

async function runQuery(
  token: string,
  domain: string,
  apl: string,
  startTime: string,
  endTime: string,
): Promise<QueryResult> {
  try {
    const response = await fetch(queryUrl(domain), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apl, startTime, endTime }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (response.status === 403 || response.status === 401) {
      return { ok: false, reason: "forbidden" };
    }

    if (!response.ok) {
      return { ok: false, reason: "unavailable" };
    }

    const body = (await response.json()) as unknown;

    if (!body || typeof body !== "object") {
      return { ok: false, reason: "contract" };
    }

    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * One page of events, newest first.
 *
 * APL has no `OFFSET`, so page N is reached by asking for everything up to the
 * end of that page and dropping what comes before it. That is why {@link MAX_PAGE}
 * exists: the cost of this grows with the page number, and an operator who needs
 * to go deeper than that wants Axiom's console rather than this list.
 *
 * One row beyond the window is requested as well. It is never rendered — it only
 * has to exist, which is what tells the pager there is a next page without a
 * second round trip.
 */
export async function getAppEvents({
  page = 1,
  level = "problems",
}: { page?: number; level?: LogLevelFilter } = {}): Promise<AppEventsResult> {
  if (!hasServiceRoleKey()) {
    return { ok: false, reason: "not_configured" };
  }

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  const credentials = readAxiomCredentials(data?.providers ?? {});

  if (!credentials.apiToken) {
    return { ok: false, reason: "not_configured" };
  }

  const dataset = credentials.dataset.replace(/'/g, "");
  const safePage = Math.min(Math.max(Math.trunc(page) || 1, 1), MAX_PAGE);
  const clause = LEVEL_CLAUSES[level] ?? LEVEL_CLAUSES.problems;
  const source = `['${dataset}'] ${clause}`;
  const reach = safePage * PAGE_SIZE + 1;

  const startTime = new Date(Date.now() - WINDOW_MS).toISOString();
  const endTime = new Date().toISOString();

  /*
   * The count is a separate question and a separate query. It runs alongside
   * rather than after, and it is allowed to fail on its own: a missing total
   * costs the pager its "of 3" and nothing else, so it must not be able to take
   * the list down with it.
   */
  const [rows, count] = await Promise.all([
    runQuery(
      credentials.apiToken,
      credentials.domain,
      `${source} | sort by _time desc | limit ${reach}`,
      startTime,
      endTime,
    ),
    runQuery(
      credentials.apiToken,
      credentials.domain,
      `${source} | summarize count()`,
      startTime,
      endTime,
    ),
  ]);

  if (!rows.ok) {
    return rows;
  }

  if (!Array.isArray(rows.body.matches)) {
    // Only the ingest contract was verifiable when this was written; say so
    // rather than render an empty page that looks like a healthy store.
    return { ok: false, reason: "contract" };
  }

  const all = rows.body.matches.map(toEvent).filter((e): e is AppEvent => e !== null);
  const from = (safePage - 1) * PAGE_SIZE;

  return {
    ok: true,
    events: all.slice(from, from + PAGE_SIZE),
    total: count.ok ? readCount(count.body) : null,
    hasMore: all.length > from + PAGE_SIZE,
  };
}
