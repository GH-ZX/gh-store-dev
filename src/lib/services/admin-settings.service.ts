import "server-only";

import { requireAdmin } from "@/lib/auth/guards";
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

export async function getRecentSyncLogs(
  providerName: string,
  limit = 5,
): Promise<ProviderSyncLogEntry[]> {
  await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("provider_sync_logs")
    .select(
      "id, kind, status, requested_count, created_count, updated_count, failed_count, started_at, finished_at, error_message",
    )
    .eq("provider_name", providerName)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    return [];
  }

  return data.map((row) => ({
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
}
