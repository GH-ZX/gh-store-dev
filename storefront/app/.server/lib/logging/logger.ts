import { outcomeFields, outcomeLevel, type Outcome } from "@server/lib/logging/outcome";
import { redact } from "@server/lib/logging/redact";
import {
  axiomIngestUrl,
  LOG_LEVELS,
  readAxiomCredentials,
  type LogLevel,
} from "@server/lib/settings/axiom-settings";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@server/lib/supabase/service";

/**
 * The store's log — Workers port.
 *
 * One rule governs everything here: **logging must never affect the thing it is
 * logging.** No call awaits delivery, no failure propagates, and a missing or
 * broken destination is silent.
 *
 * Delivery runs as an unawaited background send, exactly like the legacy
 * `after()`-outside-a-request fallback: callers are never delayed, and the
 * console line is always written first so `wrangler tail` shows every event
 * even when Axiom is unreachable. Route-level `waitUntil` threading can extend
 * lifetimes later; correctness never depends on it.
 *
 * Call sites name an `area` and an `event` rather than writing sentences, so the
 * log can be grouped and counted instead of only read. Every field passes
 * through redact before it leaves.
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
      body: JSON.stringify([{ ...event, _time: event.time }]),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
  } catch {
    // Swallowed on purpose: the alternative is a logger that breaks a checkout.
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

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }

  // Unawaited by design: the caller is never delayed by log delivery.
  void ship(payload, level);
}

export const log = {
  debug: (area: string, event: string, fields?: LogFields) => emit("debug", area, event, fields),
  info: (area: string, event: string, fields?: LogFields) => emit("info", area, event, fields),
  warn: (area: string, event: string, fields?: LogFields) => emit("warn", area, event, fields),
  error: (area: string, event: string, fields?: LogFields) => emit("error", area, event, fields),
};

/** Log a caught error without unwrapping it at every call site. */
export function logFailure(area: string, event: string, error: unknown, fields: LogFields = {}): void {
  log.error(area, event, {
    ...fields,
    error: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : "unknown",
  });
}

/** One call at the end of a service function so every flow reports itself the same way. */
export function logOutcome(
  area: string,
  event: string,
  result: Outcome,
  fields: LogFields = {},
): void {
  emit(outcomeLevel(result), area, event, { ...fields, ...outcomeFields(result) });
}
