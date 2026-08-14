import "server-only";

import { after } from "next/server";
import { redact } from "@/lib/logging/redact";
import {
  axiomIngestUrl,
  LOG_LEVELS,
  readAxiomCredentials,
  type LogLevel,
} from "@/lib/settings/axiom-settings";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * The store's log.
 *
 * One rule governs everything here: **logging must never affect the thing it is
 * logging.** No call awaits delivery, no failure propagates, and a missing or
 * broken destination is silent. A refund that fails because the log service was
 * down would be the worst possible trade.
 *
 * Delivery is handed to `after()`, so events are shipped once the response has
 * been sent rather than on the customer's clock. Events are still written to the
 * console first, which is what makes them visible in `next dev` and in the
 * Cloudflare tail with no destination configured at all.
 *
 * Call sites name an `area` and an `event` rather than writing sentences, so the
 * log can be grouped and counted instead of only read. Every field passes
 * through {@link redact} before it leaves.
 */

export type LogFields = Record<string, unknown>;

/** Cached so a burst of events costs one settings read rather than one each. */
type Destination = { token: string; url: string; minLevel: LogLevel } | null;

let cached: { value: Destination; at: number } | null = null;
const CACHE_MS = 60_000;

async function destination(): Promise<Destination> {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }

  let value: Destination = null;

  try {
    if (hasServiceRoleKey()) {
      const supabase = createSupabaseServiceClient();
      const { data } = await supabase
        .from("store_settings")
        .select("providers")
        .eq("id", "global")
        .maybeSingle();

      const credentials = readAxiomCredentials(data?.providers ?? {});

      if (credentials.apiToken && credentials.enabled) {
        value = {
          token: credentials.apiToken,
          url: axiomIngestUrl(credentials.domain, credentials.dataset),
          minLevel: credentials.minLevel,
        };
      }
    }
  } catch {
    // Unreadable settings mean no destination, not a thrown request.
    value = null;
  }

  cached = { value, at: Date.now() };

  return value;
}

/** Forget the cached destination, so a settings change takes effect at once. */
export function resetLogDestination(): void {
  cached = null;
}

function meetsLevel(level: LogLevel, minimum: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(minimum);
}

async function ship(event: Record<string, unknown>, level: LogLevel): Promise<void> {
  const target = await destination();

  if (!target || !meetsLevel(level, target.minLevel)) {
    return;
  }

  try {
    await fetch(target.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${target.token}`,
        "Content-Type": "application/json",
      },
      /*
       * The event's own fields, flat. Axiom stores the posted object as the
       * row, so wrapping it in `data` buries every field one level down — the
       * event still arrives, but `level` and `area` become `data.level` and
       * `data.area`, and a query written against the obvious names compiles to
       * "invalid field".
       *
       * `_time` is the row's timestamp; anything else is a field.
       */
      body: JSON.stringify([{ ...event, _time: event.time }]),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
  } catch {
    // Swallowed on purpose, and the only place in this codebase where that is
    // the right answer: the alternative is a logger that breaks a checkout.
  }
}

function emit(level: LogLevel, area: string, event: string, fields: LogFields = {}): void {
  const payload = {
    time: new Date().toISOString(),
    level,
    area,
    event,
    ...(redact(fields) as LogFields),
  };

  /*
   * Console first and always. It is what makes an event visible in `next dev`
   * and in `wrangler tail` before any destination exists, and it is the only
   * record if the store is running without a service role key.
   */
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  try {
    // Deferred: the response goes out first, and shipping happens after.
    after(() => ship(payload, level));
  } catch {
    /*
     * `after` throws outside a request — a scheduled sweep, a script. Ship
     * inline instead and drop the result; the promise is deliberately not
     * awaited so the caller is never delayed.
     */
    void ship(payload, level);
  }
}

export const log = {
  debug: (area: string, event: string, fields?: LogFields) => emit("debug", area, event, fields),
  info: (area: string, event: string, fields?: LogFields) => emit("info", area, event, fields),
  warn: (area: string, event: string, fields?: LogFields) => emit("warn", area, event, fields),
  error: (area: string, event: string, fields?: LogFields) => emit("error", area, event, fields),
};

/**
 * Log a caught error without having to unwrap it at every call site.
 *
 * The 27 silent `catch {}` blocks this replaces each threw away the only
 * evidence of what went wrong.
 */
export function logFailure(area: string, event: string, error: unknown, fields: LogFields = {}): void {
  log.error(area, event, {
    ...fields,
    error: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : "unknown",
  });
}
