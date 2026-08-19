import { z } from "zod";
import { maskSecret } from "@/lib/settings/provider-settings";
import type { Json } from "@/types/database";

/**
 * Where the store's logs are sent.
 *
 * Stored in `store_settings.providers.axiom`, beside the supplier and payment
 * credentials, so the owner changes it from the same page rather than through a
 * deployment. The token is server-only and comes back masked, exactly like the
 * others.
 *
 * Logging is off until a token and a dataset both exist. Off means silent: the
 * store must run identically with no logging destination configured, because a
 * missing log target is an inconvenience and a broken checkout is not.
 */

export const AXIOM_DEFAULTS = {
  /** Axiom's US edge. An EU workspace uses a different domain. */
  domain: "api.axiom.co",
  dataset: "gh-store",
} as const;

const axiomSettingsSchema = z.object({
  api_token: z.string().nullish(),
  dataset: z.string().nullish(),
  domain: z.string().nullish(),
  enabled: z.boolean().optional().catch(undefined),
  /** Events below this are dropped before they are sent. */
  min_level: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const providerSettingsSchema = z.object({
  axiom: axiomSettingsSchema.optional().catch(undefined),
});

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type AxiomCredentials = {
  apiToken: string | null;
  dataset: string;
  domain: string;
  enabled: boolean;
  minLevel: LogLevel;
};

export type AxiomStatus = {
  configured: boolean;
  tokenHint: string | null;
  dataset: string;
  domain: string;
  enabled: boolean;
  minLevel: LogLevel;
  updatedAt: string | null;
};

function normalizeLevel(value: string | null | undefined): LogLevel {
  const level = value?.trim().toLowerCase();

  return (LOG_LEVELS as readonly string[]).includes(level ?? "") ? (level as LogLevel) : "info";
}

/**
 * The host out of a bare host or a full URL.
 *
 * An owner copying an address out of Axiom may paste `api.axiom.co`, a trailing
 * slash, or a whole URL with a path — the dataset page hands over addresses
 * like `https://…/v1/ingest/gh-store`, and pasting one of those must not build
 * `…/v1/ingest/gh-store/v1/ingest/gh-store`. Only the host survives.
 */
function toHost(value: string | null | undefined): string | null {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

    return url.hostname || null;
  } catch {
    return null;
  }
}

function normalizeDomain(value: string | null | undefined): string {
  return toHost(value) ?? AXIOM_DEFAULTS.domain;
}

export function readAxiomCredentials(providers: unknown): AxiomCredentials {
  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.axiom : undefined;
  const apiToken = settings?.api_token?.trim() || null;
  const dataset = settings?.dataset?.trim() || AXIOM_DEFAULTS.dataset;

  return {
    apiToken,
    dataset,
    domain: normalizeDomain(settings?.domain),
    // A destination with no token to reach it is not a destination.
    enabled: settings?.enabled !== false && apiToken !== null,
    minLevel: normalizeLevel(settings?.min_level),
  };
}

export function toAxiomStatus(providers: unknown): AxiomStatus {
  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.axiom : undefined;
  const credentials = readAxiomCredentials(providers);

  return {
    configured: credentials.apiToken !== null,
    tokenHint: maskSecret(credentials.apiToken),
    dataset: credentials.dataset,
    domain: credentials.domain,
    enabled: credentials.enabled,
    minLevel: credentials.minLevel,
    updatedAt: settings?.updated_at ?? null,
  };
}

/**
 * Where to POST events, which depends on which Axiom host is configured.
 *
 * Axiom exposes ingest at two different paths. The API host takes
 * `/v1/datasets/{dataset}/ingest`; an edge deployment host — the
 * `…edge.axiom.co` address shown on a dataset's own page — takes
 * `/v1/ingest/{dataset}`. Sending the edge path to the API host answers 404
 * with "path not found", which reads like a missing dataset and is not one.
 *
 * Both are accepted here because an owner copying an address out of Axiom may
 * reasonably arrive with either.
 */
export function axiomIngestUrl(domain: string, dataset: string): string {
  const host = toHost(domain) ?? AXIOM_DEFAULTS.domain;
  const name = encodeURIComponent(dataset.trim() || AXIOM_DEFAULTS.dataset);

  return /(^|\.)edge\.axiom\.co$/i.test(host)
    ? `https://${host}/v1/ingest/${name}`
    : `https://${host}/v1/datasets/${name}/ingest`;
}

export type AxiomSettingsUpdate = {
  apiToken?: string;
  dataset?: string;
  domain?: string;
  enabled?: boolean;
  minLevel?: string;
};

/**
 * Merge an update into the stored provider settings.
 *
 * An omitted token leaves the stored one alone so the dataset or level can be
 * changed without re-entering the secret; an explicit empty string clears it.
 * Unmanaged fields are carried over rather than rebuilt — the same rule the Sam
 * settings learned the hard way, when a rebuild silently dropped the callback
 * secret on every save.
 */
export function mergeAxiomSettings(
  providers: Json | null | undefined,
  update: AxiomSettingsUpdate,
  updatedAt: string,
): Json {
  const base: Record<string, Json | undefined> =
    providers && typeof providers === "object" && !Array.isArray(providers) ? { ...providers } : {};

  const parsed = providerSettingsSchema.safeParse(providers ?? {});
  const storedFlag = parsed.success ? parsed.data.axiom?.enabled : undefined;
  const current = readAxiomCredentials(providers);
  const suppliedToken = update.apiToken?.trim();
  const nextToken = update.apiToken === undefined ? current.apiToken : suppliedToken || null;

  const stored =
    base.axiom && typeof base.axiom === "object" && !Array.isArray(base.axiom)
      ? (base.axiom as Record<string, Json>)
      : {};

  base.axiom = {
    ...stored,
    api_token: nextToken,
    dataset: (update.dataset ?? current.dataset).trim() || AXIOM_DEFAULTS.dataset,
    domain: normalizeDomain(update.domain ?? current.domain),
    enabled:
      update.enabled ?? (nextToken === null ? false : suppliedToken ? true : storedFlag !== false),
    min_level: normalizeLevel(update.minLevel ?? current.minLevel),
    updated_at: updatedAt,
  };

  return base;
}
