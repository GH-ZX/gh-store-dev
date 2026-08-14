import "server-only";

import { hasContent } from "@/lib/logging/fields";
import { readAxiomCredentials } from "@/lib/settings/axiom-settings";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * Read recent events back out of Axiom, for the dashboard.
 *
 * Axiom's own console is the place to investigate — it has the query language,
 * the dashboards and the alerts, and none of that is worth rebuilding here.
 * What the store's own Logs page owes an operator is narrower: whether anything
 * is broken right now, without leaving the dashboard to find out.
 *
 * So this asks one question — the recent warnings and errors — and links out for
 * everything else.
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
  | { ok: true; events: AppEvent[] }
  | { ok: false; reason: "not_configured" | "forbidden" | "unavailable" | "contract" };

const QUERY_PATH = "/v1/datasets/_apl?format=legacy";

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

export async function getRecentAppEvents(limit = 50): Promise<AppEventsResult> {
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
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const response = await fetch(queryUrl(credentials.domain), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apl: `['${dataset}'] | where level in ('warn', 'error') | sort by _time desc | limit ${limit}`,
        startTime: since,
        endTime: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (response.status === 403 || response.status === 401) {
      return { ok: false, reason: "forbidden" };
    }

    if (!response.ok) {
      return { ok: false, reason: "unavailable" };
    }

    const body = (await response.json()) as { matches?: unknown };

    if (!Array.isArray(body.matches)) {
      // Only the ingest contract was verifiable when this was written; say so
      // rather than render an empty page that looks like a healthy store.
      return { ok: false, reason: "contract" };
    }

    return { ok: true, events: body.matches.map(toEvent).filter((e): e is AppEvent => e !== null) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
