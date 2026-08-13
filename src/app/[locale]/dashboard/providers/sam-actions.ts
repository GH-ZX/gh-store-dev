"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText } from "@/lib/forms/form-data";
import { getSamCredentials, saveSamSettings } from "@/lib/services/admin-settings.service";
import { isValidSamIdentifier, SAM_METHODS } from "@/lib/settings/sam-settings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SamClient } from "@/providers/sam/client";
import { SamError } from "@/providers/sam/errors";
import {
  INITIAL_SAM_STATE,
  type SamActionState,
  type SamWalletOption,
} from "@/app/[locale]/dashboard/providers/sam-action-state";

/**
 * Sam API administration.
 *
 * Two secrets are involved and neither ever leaves the server. The API key is
 * typed once by the owner and afterwards represented only by a masked tail. The
 * callback secret is generated here and never displayed at all: Sam is told the
 * callback URL with each invoice, so unlike the store this replaces there is
 * nothing for an owner to copy, paste, or leak.
 */

const settingsSchema = z.object({
  apiKey: z.string().max(400).optional(),
  enabled: z.boolean(),
  manualReview: z.boolean(),
  shamcashIdentifier: z.string().trim().max(120).optional(),
  syriatelIdentifier: z.string().trim().max(120).optional(),
  invoiceCurrency: z.string().trim().max(8).optional(),
  sypPerUsd: z.coerce.number().min(0).max(1_000_000).optional(),
  locale: z.string().optional(),
});

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

function errorKey(error: unknown): string {
  return error instanceof SamError ? error.kind : "unknown";
}

/**
 * A callback secret, generated rather than typed.
 *
 * Two UUIDs' worth of hex: long enough that guessing is hopeless, and produced
 * server-side so an owner cannot accidentally choose something weak.
 */
function newWebhookSecret(): string {
  return `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
}

async function ensureWebhookSecret(regenerate: boolean): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("store_settings").select("providers").eq("id", "global").maybeSingle();
  const providers =
    data?.providers && typeof data.providers === "object" && !Array.isArray(data.providers)
      ? { ...(data.providers as Record<string, unknown>) }
      : {};
  const sam = (providers.sam ?? {}) as Record<string, unknown>;
  const existing = typeof sam.webhook_secret === "string" ? sam.webhook_secret.trim() : "";

  if (existing.length > 0 && !regenerate) {
    return;
  }

  providers.sam = { ...sam, webhook_secret: newWebhookSecret() };

  await supabase
    .from("store_settings")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb column
    .update({ providers: providers as any })
    .eq("id", "global");
}

export async function saveSamSettingsAction(
  _state: SamActionState,
  formData: FormData,
): Promise<SamActionState> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse({
    apiKey: formText(formData, "apiKey"),
    enabled: formFlag(formData, "enabled"),
    manualReview: formFlag(formData, "manualReview"),
    shamcashIdentifier: formText(formData, "shamcashIdentifier"),
    syriatelIdentifier: formText(formData, "syriatelIdentifier"),
    invoiceCurrency: formText(formData, "invoiceCurrency"),
    sypPerUsd: formText(formData, "sypPerUsd"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_SAM_STATE, error: "invalid_input" };
  }

  const input = parsed.data;

  /*
   * Reject a malformed wallet here rather than letting a customer discover it as
   * a failed payment: ShamCash wants a 32-character address, Syriatel a phone or
   * cash code.
   */
  for (const method of SAM_METHODS) {
    const identifier = method === "shamcash" ? input.shamcashIdentifier : input.syriatelIdentifier;

    if (identifier && identifier.length > 0 && !isValidSamIdentifier(method, identifier)) {
      return {
        ...INITIAL_SAM_STATE,
        error: method === "shamcash" ? "invalid_shamcash" : "invalid_syriatel",
      };
    }
  }

  // Invoicing in pounds without a rate would bill zero.
  if (input.invoiceCurrency?.toUpperCase() === "SYP" && (input.sypPerUsd ?? 0) <= 0) {
    return { ...INITIAL_SAM_STATE, error: "missing_rate" };
  }

  try {
    await saveSamSettings({
      apiKey: input.apiKey,
      enabled: input.enabled,
      manualReview: input.manualReview,
      shamcashIdentifier: input.shamcashIdentifier ?? "",
      syriatelIdentifier: input.syriatelIdentifier ?? "",
      invoiceCurrency: input.invoiceCurrency,
      sypPerUsd: input.sypPerUsd,
    });

    // Sam cannot report a payment without a callback URL, so a saved key is
    // useless until a secret exists.
    await ensureWebhookSecret(formFlag(formData, "regenerateSecret"));
  } catch {
    return { ...INITIAL_SAM_STATE, error: "unknown" };
  }

  const locale = resolveLocale(input.locale);
  revalidatePath(`/${locale}/dashboard/providers`);
  revalidatePath(`/${locale}/recharge`);

  return { ...INITIAL_SAM_STATE, notice: "saved" };
}

/**
 * List the wallets linked to the stored key.
 *
 * This is how an owner finds out what to put in the identifier fields, and it
 * doubles as the key test: reaching the wallet list at all proves the key works.
 */
export async function testSamWalletsAction(
  _state: SamActionState,
  formData: FormData,
): Promise<SamActionState> {
  await requireAdmin();

  const locale = resolveLocale(formText(formData, "locale"));
  const credentials = await getSamCredentials();

  if (!credentials.apiKey) {
    return { ...INITIAL_SAM_STATE, error: "not_configured" };
  }

  try {
    const client = new SamClient(credentials.apiKey);
    const wallets = await client.listWallets();

    const options: SamWalletOption[] = await Promise.all(
      wallets.map(async (wallet) => ({
        provider: wallet.provider,
        label: wallet.label,
        identifier: wallet.identifier,
        balances: wallet.identifier
          ? await client.getWalletBalance(wallet.provider, wallet.identifier).catch(() => [])
          : [],
      })),
    );

    revalidatePath(`/${locale}/dashboard/providers`);

    return { error: null, notice: "wallets_loaded", wallets: options };
  } catch (error) {
    return { ...INITIAL_SAM_STATE, error: errorKey(error) };
  }
}
