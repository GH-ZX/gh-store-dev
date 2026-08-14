import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
import { resetLogDestination } from "@/lib/logging/logger";
import { PAGE_SIZE, pageRange } from "@/lib/paging";
import {
  mergeAxiomSettings,
  toAxiomStatus,
  type AxiomSettingsUpdate,
  type AxiomStatus,
} from "@/lib/settings/axiom-settings";
import {
  mergeG2BulkSettings,
  readG2BulkCredentials,
  toG2BulkStatus,
  type G2BulkCredentials,
  type G2BulkStatus,
} from "@/lib/settings/provider-settings";
import {
  mergeSamSettings,
  readSamCredentials,
  toSamStatus,
  type SamCredentials,
  type SamSettingsUpdate,
  type SamStatus,
} from "@/lib/settings/sam-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Admin reads and writes of provider configuration.
 *
 * Every function here runs behind {@link requireAdmin} and uses the caller's own
 * session, so the database's admin policy is the real gate — no service-role key
 * is involved. {@link getG2BulkCredentials} returns the secret and is server
 * only; UI code must use {@link getG2BulkStatus}, which returns a masked hint.
 */

const SETTINGS_ID = "global";

async function readProviders(): Promise<Json> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Reading provider settings failed: ${error.message}`);
  }

  return data?.providers ?? {};
}

export async function getG2BulkStatus(): Promise<G2BulkStatus> {
  await requireAdmin();

  return toG2BulkStatus(await readProviders());
}

/** Server-only: returns the plaintext API key. Never pass the result to a client component. */
export async function getG2BulkCredentials(): Promise<G2BulkCredentials> {
  await requireAdmin();

  return readG2BulkCredentials(await readProviders());
}

export async function saveG2BulkSettings(update: {
  apiKey?: string;
  markupPercent?: number;
  enabled?: boolean;
}): Promise<G2BulkStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProviders();
  const next = mergeG2BulkSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving provider settings failed: ${error.message}`);
  }

  return toG2BulkStatus(data.providers);
}

export async function getSamStatus(): Promise<SamStatus> {
  await requireAdmin();

  return toSamStatus(await readProviders());
}

/** Server-only: returns the plaintext Sam API key. Never pass the result to a client component. */
export async function getSamCredentials(): Promise<SamCredentials> {
  await requireAdmin();

  return readSamCredentials(await readProviders());
}

export async function saveSamSettings(update: SamSettingsUpdate): Promise<SamStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const providers = await readProviders();
  const next = mergeSamSettings(providers, update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving Sam API settings failed: ${error.message}`);
  }

  return toSamStatus(data.providers);
}

export async function getAxiomStatus(): Promise<AxiomStatus> {
  await requireAdmin();

  return toAxiomStatus(await readProviders());
}

/**
 * Save the logging destination.
 *
 * The cached destination is dropped afterwards so a corrected token takes effect
 * on the next event rather than up to a minute later, which is the difference
 * between "I fixed it and nothing happened" and "I fixed it".
 */
export async function saveAxiomSettings(update: AxiomSettingsUpdate): Promise<AxiomStatus> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const next = mergeAxiomSettings(await readProviders(), update, new Date().toISOString());

  const { data, error } = await supabase
    .from("store_settings")
    .update({ providers: next })
    .eq("id", SETTINGS_ID)
    .select("providers")
    .single();

  if (error) {
    throw new Error(`Saving the logging settings failed: ${error.message}`);
  }

  resetLogDestination();

  return toAxiomStatus(data.providers);
}

export type ProviderSyncLogEntry = {
  id: string;
  kind: string;
  status: string;
  requestedCount: number;
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

/**
 * Provider runs, a page at a time.
 *
 * The result says whether the read worked rather than handing back a list,
 * because a failed query and a provider that has never run produce the same
 * empty array and mean opposite things. This used to return `[]` on error, so a
 * broken read rendered as "no runs yet" — the reassuring answer, and the wrong
 * one. The Logs page already draws that distinction for Axiom events; it holds
 * here for the same reason.
 */
export type ProviderSyncLogsResult =
  | { ok: true; runs: ProviderSyncLogEntry[]; total: number }
  | { ok: false };

export async function getRecentSyncLogs(
  providerName: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<ProviderSyncLogsResult> {
  await requireAdmin();

  const { from, to } = pageRange(options.page ?? 1, options.pageSize ?? PAGE_SIZE);

  const supabase = await createSupabaseServerClient();
  const { data, error, count } = await supabase
    .from("provider_sync_logs")
    .select(
      "id, kind, status, requested_count, created_count, updated_count, failed_count, started_at, finished_at, error_message",
      { count: "exact" },
    )
    .eq("provider_name", providerName)
    .order("started_at", { ascending: false })
    .range(from, to);

  if (error) {
    return { ok: false };
  }

  const runs = data.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    requestedCount: row.requested_count,
    createdCount: row.created_count,
    updatedCount: row.updated_count,
    failedCount: row.failed_count,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
  }));

  return { ok: true, runs, total: count ?? runs.length };
}
