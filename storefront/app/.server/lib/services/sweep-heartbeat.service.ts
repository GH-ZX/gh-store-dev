import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The reconciliation sweep's heartbeat. After every sweep attempt the worker
 * stamps `sweep_heartbeats`, so a sweep that stops — rotated secret, broken
 * deploy, long provider outage — is visible instead of silent.
 *
 * Same rule as the logger: this must never break the thing it observes. Both
 * writers swallow every error, and both no-op without a service client.
 */

const ERROR_MAX = 300;

/** The single row's fixed id, enforced by the table's own check constraint. */
const GLOBAL_ID = "global";

export type SweepHeartbeat = {
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export async function recordSweepSuccess(service: SupabaseClient | null): Promise<void> {
  if (!service) {
    return;
  }
  try {
    const now = new Date().toISOString();
    await service.from("sweep_heartbeats").upsert({
      id: GLOBAL_ID,
      last_success_at: now,
      updated_at: now,
    });
  } catch {
    // Swallowed on purpose — see the module comment.
  }
}

export async function recordSweepFailure(
  service: SupabaseClient | null,
  error: unknown,
): Promise<void> {
  if (!service) {
    return;
  }
  try {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await service.from("sweep_heartbeats").upsert({
      id: GLOBAL_ID,
      last_failure_at: now,
      last_error: message.slice(0, ERROR_MAX),
      updated_at: now,
    });
  } catch {
    // Swallowed on purpose — see the module comment.
  }
}

export async function readSweepHeartbeat(
  service: SupabaseClient | null,
): Promise<SweepHeartbeat | null> {
  if (!service) {
    return null;
  }
  const { data } = await service
    .from("sweep_heartbeats")
    .select("last_success_at, last_failure_at, last_error")
    .eq("id", GLOBAL_ID)
    .maybeSingle();
  if (!data) {
    return null;
  }
  const row = data as unknown as {
    last_success_at: string | null;
    last_failure_at: string | null;
    last_error: string | null;
  };
  return {
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error,
  };
}
