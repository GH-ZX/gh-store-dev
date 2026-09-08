import "server-only";

import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * The reconciliation sweep's heartbeat.
 *
 * The Worker cron calls `POST /api/reconcile` every five minutes. A sweep that
 * stops — a rotated secret, a broken deploy, a provider outage long enough to
 * trip every run — fails nobody loudly: orders simply stay `fulfilling` until
 * a customer complains. This module is the app-side half of the fix. After
 * every sweep attempt it stamps `sweep_heartbeats`, and the Worker's
 * scheduled tick (see `worker/telegram-bot.ts`) compares the stamp against the
 * clock and alerts the owner when the sweep has gone quiet.
 *
 * Both directions matter. A success keeps `last_success_at` fresh so silence
 * is meaningful; a failure is recorded too, so the alert can say *why* the
 * sweep went quiet rather than only that it did.
 *
 * Same rule as the logger and the Telegram queue: this must never break the
 * thing it observes. A heartbeat write is fire-and-forget and swallows every
 * error — a sweep that refunds a customer's order does not get to fail because
 * the observability table was locked.
 */

const ERROR_MAX = 300;

/** The single row's fixed id, enforced by the table's own check constraint. */
const GLOBAL_ID = "global";

export type SweepHeartbeat = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export async function recordSweepSuccess(): Promise<void> {
  if (!hasServiceRoleKey()) {
    return;
  }

  try {
    const supabase = createSupabaseServiceClient();
    const now = new Date().toISOString();

    await supabase.from("sweep_heartbeats").upsert({
      id: GLOBAL_ID,
      last_success_at: now,
      updated_at: now,
    });
  } catch {
    // Swallowed on purpose — see the module comment.
  }
}

export async function recordSweepFailure(error: unknown): Promise<void> {
  if (!hasServiceRoleKey()) {
    return;
  }

  try {
    const supabase = createSupabaseServiceClient();
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);

    await supabase.from("sweep_heartbeats").upsert({
      id: GLOBAL_ID,
      last_failure_at: now,
      last_error: message.slice(0, ERROR_MAX),
      updated_at: now,
    });
  } catch {
    // Swallowed on purpose — see the module comment.
  }
}

/**
 * The current stamp, or null when the table has never been written.
 *
 * Read by the Worker over the REST interface rather than through this module
 * (the Worker cannot import `server-only` code), so this exists for tests and
 * for any future in-app surface that wants to show the sweep's pulse.
 */
export async function readSweepHeartbeat(): Promise<SweepHeartbeat | null> {
  if (!hasServiceRoleKey()) {
    return null;
  }

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("sweep_heartbeats")
    .select("last_success_at, last_failure_at, last_error")
    .eq("id", GLOBAL_ID)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    lastSuccessAt: data.last_success_at,
    lastFailureAt: data.last_failure_at,
    lastError: data.last_error,
  };
}
