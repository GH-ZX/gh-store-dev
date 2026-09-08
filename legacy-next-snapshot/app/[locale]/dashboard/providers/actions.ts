"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { BatStoreClient } from "@/providers/batstore/client";
import { BatStoreError } from "@/providers/batstore/errors";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { G2BulkError } from "@/providers/g2bulk/errors";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { MaxStoreClient } from "@/providers/maxstore/client";
import { MaxStoreError } from "@/providers/maxstore/errors";
import { requireAdmin } from "@/lib/auth/guards";
import { logFailure } from "@/lib/logging/logger";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import {
  getBatStoreCredentials,
  getG2BulkCredentials,
  getIgdbCredentials,
  getMaxStoreCredentials,
  saveFulfillmentSettings,
  saveBatStoreSettings,
  saveBinanceSettings,
  saveIgdbSettings,
  regenerateG2BulkCallbackSecret,
  saveG2BulkSettings,
  saveMaxStoreSettings,
} from "@/lib/services/admin-settings.service";
import { IgdbClient, IgdbError } from "@/providers/igdb/client";
import { removeImportedProduct, type RemoveImportedResult } from "@/lib/services/admin-catalog.service";
import { importG2BulkGames } from "@/lib/services/g2bulk-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  INITIAL_PROVIDER_STATE,
  type ProviderActionState,
} from "@/app/[locale]/dashboard/providers/action-state";
import type { UniversalImportActionState } from "@/app/[locale]/dashboard/providers/import/action-state";

/**
 * Provider administration actions.
 *
 * Results are returned as message keys, never as prose, so the page renders them
 * in the admin's language. Nothing here ever returns the API key: a caller only
 * learns whether it works.
 */

const settingsSchema = z.object({
  apiKey: z.string().max(400).optional(),
  markupPercent: z.coerce.number().min(0).max(500),
  locale: z.string().optional(),
});

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Map a provider failure onto a message key the page can localize. */
function errorKey(error: unknown): string {
  if (
    error instanceof G2BulkError ||
    error instanceof MaxStoreError ||
    error instanceof BatStoreError ||
    error instanceof IgdbError
  ) {
    // All the suppliers classify failures with the same vocabulary, so one
    // message catalogue serves them and another supplier costs nothing here.
    return error.kind;
  }

  return "unknown";
}

export async function saveG2BulkSettingsAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse({
    apiKey: formText(formData, "apiKey"),
    markupPercent: formText(formData, "markupPercent"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_PROVIDER_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await saveG2BulkSettings({
      // An empty field means "keep the saved key", so it is not forwarded.
      apiKey: parsed.data.apiKey?.trim() ? parsed.data.apiKey : undefined,
      markupPercent: parsed.data.markupPercent,
    });
  } catch (error) {
    logFailure("admin.providers", "g2bulk_settings_save_failed", error);

    return { ...INITIAL_PROVIDER_STATE, error: "unknown" };
  }

  revalidatePath(`/${locale}/dashboard/providers`);

  return { ...INITIAL_PROVIDER_STATE, notice: "saved" };
}

export async function verifyG2BulkKeyAction(
  _state: ProviderActionState,
  _formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const { apiKey } = await getG2BulkCredentials();

  if (!apiKey) {
    return { ...INITIAL_PROVIDER_STATE, error: "missing_key" };
  }

  try {
    const account = await new G2BulkClient({ apiKey }).getAccount();

    return {
      error: null,
      notice: "verified",
      account: {
        username: account.username ?? account.first_name ?? String(account.user_id),
        balance: account.balance,
      },
    };
  } catch (error) {
    return { ...INITIAL_PROVIDER_STATE, error: errorKey(error) };
  }
}

/**
 * Turn the supplier callback on, or move it to a new secret.
 *
 * One action for both, because they are the same write and the page can tell
 * them apart from the status it already has. Nothing else generates this: an
 * owner never types the secret, and saving the API key must not disturb it.
 */
export async function regenerateG2BulkCallbackAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const locale = resolveLocale(formText(formData, "locale"));

  try {
    await regenerateG2BulkCallbackSecret();
  } catch (error) {
    logFailure("admin.providers", "g2bulk_callback_secret_failed", error);

    return { ...INITIAL_PROVIDER_STATE, error: "unknown" };
  }

  revalidatePath(`/${locale}/dashboard/providers`);

  return { ...INITIAL_PROVIDER_STATE, notice: "callback_ready" };
}

const importSchema = z.object({
  codes: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
  publish: z.boolean(),
  locale: z.string().optional(),
});

export async function importG2BulkGamesAction(
  _state: UniversalImportActionState,
  formData: FormData,
): Promise<UniversalImportActionState> {
  const admin = await requireAdmin();

  // Accept both "codes" (legacy) and "productIds" (universal form)
  const codes = formTextList(formData, "productIds").length > 0
    ? formTextList(formData, "productIds")
    : formTextList(formData, "codes");

  const parsed = importSchema.safeParse({
    codes,
    publish: formFlag(formData, "publish"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "no_selection", summary: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const { apiKey, markupPercent } = await getG2BulkCredentials();

  if (!apiKey) {
    return { error: "missing_key", summary: null };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const raw = await importG2BulkGames(
      supabase,
      apiKey,
      parsed.data.codes,
      { publish: parsed.data.publish, markupPercent },
      admin.id,
    );

    // Assign per-product categories from the form (category-{code} fields).
    for (const code of parsed.data.codes) {
      const categoryId = formText(formData, `category-${code}`);
      if (!categoryId) continue;

      const { data: mapping } = await supabase
        .from("provider_game_mappings")
        .select("game_id")
        .eq("provider_name", G2BULK_PROVIDER_NAME)
        .eq("external_game_code", code)
        .maybeSingle();

      if (mapping?.game_id) {
        await supabase.from("products").update({ category_id: categoryId }).eq("id", mapping.game_id);
      }
    }

    revalidatePath("/", "layout");

    return {
      error: null,
      summary: {
        created: raw.created,
        updated: raw.updated,
        failed: raw.failed,
        itemsCreated: raw.offersCreated,
        itemsUpdated: raw.offersUpdated,
        errors: raw.outcomes
          .filter((o) => o.error)
          .map((o) => ({ name: o.name, error: o.error! })),
      },
    };
  } catch (error) {
    return { error: errorKey(error), summary: null };
  } finally {
    revalidatePath(`/${locale}/dashboard/providers`);
  }
}

/**
 * Take an imported product back out of the store.
 *
 * Called straight from the picker's click handler rather than through a form:
 * the rows already sit inside the import form, forms do not nest, and a removal
 * that submitted the surrounding selection would be the wrong shape of action
 * entirely.
 *
 * Keyed by the supplier's code, which is the only identifier the picker holds.
 * The game, its packages, and its provider mappings go together; orders that
 * bought them keep their snapshots.
 */
export async function removeImportedProductAction(input: {
  code: string;
  locale: string;
  provider?: string;
}): Promise<RemoveImportedResult> {
  await requireAdmin();

  const code = typeof input.code === "string" ? input.code.trim() : "";

  if (!code || code.length > 120) {
    return { ok: false, reason: "not_imported" };
  }

  const locale = resolveLocale(input.locale);
  let result: RemoveImportedResult;

  try {
    result = await removeImportedProduct(code, input.provider);
  } catch (error) {
    logFailure("admin.providers", "imported_game_remove_failed", error, { code });

    return { ok: false, reason: "unknown" };
  }

  if (result.ok) {
    // The catalog, the pickers, and every storefront page that listed it.
    revalidatePath("/", "layout");
    revalidatePath(`/${locale}/dashboard/catalog`);
    revalidatePath(`/${locale}/dashboard/providers/g2bulk/import`);
    revalidatePath(`/${locale}/dashboard/providers/g2bulk/vouchers`);
    revalidatePath(`/${locale}/dashboard/providers/maxstore/import`);
    revalidatePath(`/${locale}/dashboard/providers/batstore/import`);
  }

  return result;
}

const maxstoreSettingsSchema = z.object({
  apiToken: z.string().max(400).optional(),
  markupPercent: z.coerce.number().min(0).max(500),
  locale: z.string().optional(),
});

export async function saveMaxStoreSettingsAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const parsed = maxstoreSettingsSchema.safeParse({
    apiToken: formText(formData, "apiToken"),
    markupPercent: formText(formData, "markupPercent"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_PROVIDER_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await saveMaxStoreSettings({
      // An empty field means "keep the saved token", so it is not forwarded.
      apiToken: parsed.data.apiToken?.trim() ? parsed.data.apiToken : undefined,
      markupPercent: parsed.data.markupPercent,
    });
  } catch (error) {
    logFailure("admin.providers", "maxstore_settings_save_failed", error);

    return { ...INITIAL_PROVIDER_STATE, error: "unknown" };
  }

  revalidatePath(`/${locale}/dashboard/providers`);

  return { ...INITIAL_PROVIDER_STATE, notice: "saved" };
}

/**
 * Prove the token, and say what it belongs to.
 *
 * `/profile` is the cheapest call MaxStore documents and returns the balance,
 * which is the number an owner actually wants to see. Nothing about this
 * integration has been checked against a live key yet, so this button is also
 * the first real test of `docs/providers/maxstore-api.md`.
 */
export async function verifyMaxStoreTokenAction(
  _state: ProviderActionState,
  _formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const { apiToken } = await getMaxStoreCredentials();

  if (!apiToken) {
    return { ...INITIAL_PROVIDER_STATE, error: "missing_key" };
  }

  try {
    const profile = await new MaxStoreClient({ apiToken }).getProfile();

    return {
      error: null,
      notice: "verified",
      account: {
        username: profile.username ?? profile.userId ?? "—",
        balance: profile.balance,
      },
    };
  } catch (error) {
    return { ...INITIAL_PROVIDER_STATE, error: errorKey(error) };
  }
}

const batstoreSchema = z.object({
  apiToken: z.string().max(400).optional(),
  markupPercent: z.coerce.number().min(0).max(500),
  locale: z.string().optional(),
});

export async function saveBatStoreSettingsAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const parsed = batstoreSchema.safeParse({
    apiToken: formText(formData, "apiToken"),
    markupPercent: formText(formData, "markupPercent") ?? "15",
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_PROVIDER_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await saveBatStoreSettings({
      // An empty field means "keep the saved token", so it is not forwarded.
      apiToken: parsed.data.apiToken?.trim() ? parsed.data.apiToken : undefined,
      markupPercent: parsed.data.markupPercent,
    });
  } catch (error) {
    logFailure("admin.providers", "batstore_settings_save_failed", error);

    return { ...INITIAL_PROVIDER_STATE, error: "unknown" };
  }

  revalidatePath(`/${locale}/dashboard/providers`);

  return { ...INITIAL_PROVIDER_STATE, notice: "saved" };
}

/**
 * Prove the key, and say what it belongs to.
 *
 * `/me` is the cheapest call BatStore documents and returns the wallet balance,
 * which is the number an owner actually wants to see. It doubles as the first
 * real test of `docs/providers/batstore-api.md`.
 */
export async function verifyBatStoreTokenAction(
  _state: ProviderActionState,
  _formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const { apiToken } = await getBatStoreCredentials();

  if (!apiToken) {
    return { ...INITIAL_PROVIDER_STATE, error: "missing_key" };
  }

  try {
    const account = await new BatStoreClient(apiToken).getMe();

    return {
      error: null,
      notice: "verified",
      account,
    };
  } catch (error) {
    return { ...INITIAL_PROVIDER_STATE, error: errorKey(error) };
  }
}

const binanceSchema = z.object({
  apiKey: z.string().max(400).optional(),
  apiSecret: z.string().max(400).optional(),
  currency: z.string().max(10).optional(),
  enabled: z.boolean(),
  locale: z.string().optional(),
});

const igdbSchema = z.object({
  clientId: z.string().max(200).optional(),
  clientSecret: z.string().max(400).optional(),
  locale: z.string().optional(),
});

export async function saveIgdbSettingsAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const parsed = igdbSchema.safeParse({
    clientId: formText(formData, "clientId"),
    clientSecret: formText(formData, "clientSecret"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_PROVIDER_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await saveIgdbSettings({
      // Empty means "keep what is stored", for both halves independently.
      clientId: parsed.data.clientId?.trim() ? parsed.data.clientId : undefined,
      clientSecret: parsed.data.clientSecret?.trim() ? parsed.data.clientSecret : undefined,
    });
  } catch (error) {
    logFailure("admin.providers", "igdb_settings_save_failed", error);

    return { ...INITIAL_PROVIDER_STATE, error: "unknown" };
  }

  revalidatePath(`/${locale}/dashboard/providers`);

  return { ...INITIAL_PROVIDER_STATE, notice: "saved" };
}

/**
 * Prove the credentials with a real search.
 *
 * The token endpoint would accept a wrong secret quietly until a search needs
 * it, so the cheapest honest test is the call an operator was going to make
 * anyway. A result arriving means both Twitch and IGDB accepted us.
 */
export async function verifyIgdbAction(
  _state: ProviderActionState,
  _formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const { clientId, clientSecret } = await getIgdbCredentials();

  if (!clientId || !clientSecret) {
    return { ...INITIAL_PROVIDER_STATE, error: "missing_key" };
  }

  try {
    const games = await new IgdbClient({ clientId, clientSecret }).searchGames("super Mario");

    return {
      error: null,
      notice: games.length > 0 ? "verified" : "empty",
      account: null,
    };
  } catch (error) {
    return { ...INITIAL_PROVIDER_STATE, error: errorKey(error) };
  }
}

/**
 * Choose what happens to a wallet charge after a terminal provider failure.
 *
 * The form uses an explicit two-value choice rather than an unchecked checkbox:
 * the dangerous state should never be selected accidentally by a missing field.
 */
const fulfillmentSettingsSchema = z.object({
  refundPolicy: z.enum(["refund", "keep"]),
  locale: z.string().optional(),
});

export async function saveFulfillmentSettingsAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const parsed = fulfillmentSettingsSchema.safeParse({
    refundPolicy: formText(formData, "refundPolicy"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_PROVIDER_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await saveFulfillmentSettings(parsed.data.refundPolicy === "refund");
  } catch (error) {
    logFailure("admin.providers", "fulfillment_settings_save_failed", error);

    return { ...INITIAL_PROVIDER_STATE, error: "unknown" };
  }

  revalidatePath(`/${locale}/dashboard/providers`);

  return { ...INITIAL_PROVIDER_STATE, notice: "saved" };
}

/**
 * Save Binance Pay.
 *
 * The enable flag is read from the form every time rather than left alone when
 * absent, because an unchecked checkbox sends nothing — treating that as "no
 * change" would make the switch impossible to turn off.
 */
export async function saveBinanceSettingsAction(
  _state: ProviderActionState,
  formData: FormData,
): Promise<ProviderActionState> {
  await requireAdmin();

  const parsed = binanceSchema.safeParse({
    apiKey: formText(formData, "apiKey"),
    apiSecret: formText(formData, "apiSecret"),
    currency: formText(formData, "currency"),
    enabled: formFlag(formData, "enabled"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_PROVIDER_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await saveBinanceSettings({
      // Empty means "keep what is stored", for both halves independently.
      apiKey: parsed.data.apiKey?.trim() ? parsed.data.apiKey : undefined,
      apiSecret: parsed.data.apiSecret?.trim() ? parsed.data.apiSecret : undefined,
      currency: parsed.data.currency,
      enabled: parsed.data.enabled,
    });
  } catch (error) {
    logFailure("admin.providers", "binance_settings_save_failed", error);

    return { ...INITIAL_PROVIDER_STATE, error: "unknown" };
  }

  revalidatePath(`/${locale}/dashboard/providers`);

  return { ...INITIAL_PROVIDER_STATE, notice: "saved" };
}
