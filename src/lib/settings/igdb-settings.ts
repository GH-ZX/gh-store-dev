import { z } from "zod";
import { maskSecret } from "@/lib/settings/provider-settings";
import type { Json } from "@/types/database";

/**
 * IGDB (Twitch) configuration, stored in `store_settings.providers.igdb`.
 *
 * IGDB is not a supplier of goods: it is where artwork comes from when a game
 * the operator built by hand has no picture. Its credentials follow the same
 * split as every other provider — {@link IgdbCredentials} carries the secret
 * and stays server-only, {@link IgdbStatus} carries masked hints and is safe to
 * render. The Twitch client id is public-facing by design and shown in full;
 * only the client secret is masked.
 */

export const igdbSettingsSchema = z.object({
  client_id: z.string().nullish(),
  client_secret: z.string().nullish(),
  updated_at: z.string().nullish(),
});

const providersSchema = z.object({
  igdb: igdbSettingsSchema.optional().catch(undefined),
});

export type IgdbCredentials = {
  clientId: string | null;
  clientSecret: string | null;
};

export type IgdbStatus = {
  configured: boolean;
  /** Shown in full: a Twitch client id identifies an application, it does not authenticate one. */
  clientId: string | null;
  clientSecretHint: string | null;
  updatedAt: string | null;
};

export function readIgdbCredentials(providers: unknown): IgdbCredentials {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.igdb : undefined;

  return {
    clientId: settings?.client_id?.trim() || null,
    clientSecret: settings?.client_secret?.trim() || null,
  };
}

export function toIgdbStatus(providers: unknown): IgdbStatus {
  const parsed = providersSchema.safeParse(providers ?? {});
  const settings = parsed.success ? parsed.data.igdb : undefined;
  const credentials = readIgdbCredentials(providers);

  return {
    configured: credentials.clientId !== null && credentials.clientSecret !== null,
    clientId: credentials.clientId,
    clientSecretHint: maskSecret(credentials.clientSecret),
    updatedAt: settings?.updated_at ?? null,
  };
}

/**
 * Merge an update into the stored provider settings.
 *
 * An omitted value leaves the saved one alone, so the secret survives an edit
 * of the client id; an explicit empty string clears it. Every other provider's
 * key in this column is copied across untouched.
 */
export function mergeIgdbSettings(
  providers: Json | null | undefined,
  update: { clientId?: string; clientSecret?: string },
  updatedAt: string,
): Json {
  const base: Record<string, Json | undefined> =
    providers && typeof providers === "object" && !Array.isArray(providers) ? { ...providers } : {};

  const current = readIgdbCredentials(providers);
  const suppliedId = update.clientId?.trim();
  const suppliedSecret = update.clientSecret?.trim();

  base.igdb = {
    client_id: update.clientId === undefined ? current.clientId : suppliedId || null,
    client_secret:
      update.clientSecret === undefined ? current.clientSecret : suppliedSecret || null,
    updated_at: updatedAt,
  };

  return base;
}
