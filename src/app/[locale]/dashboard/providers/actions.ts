"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { G2BulkError } from "@/providers/g2bulk/errors";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getG2BulkCredentials,
  saveG2BulkSettings,
} from "@/lib/services/admin-settings.service";
import { importG2BulkGames } from "@/lib/services/g2bulk-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  INITIAL_PROVIDER_STATE,
  type ImportActionState,
  type ProviderActionState,
} from "@/app/[locale]/dashboard/providers/action-state";

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
  if (error instanceof G2BulkError) {
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
    apiKey: formData.get("apiKey") ?? undefined,
    markupPercent: formData.get("markupPercent"),
    locale: formData.get("locale"),
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
  } catch {
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

const importSchema = z.object({
  codes: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
  publish: z.boolean(),
  locale: z.string().optional(),
});

export async function importG2BulkGamesAction(
  _state: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const admin = await requireAdmin();

  const parsed = importSchema.safeParse({
    codes: formData.getAll("codes").map((value) => String(value)),
    publish: formData.get("publish") === "on",
    locale: formData.get("locale"),
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
    const summary = await importG2BulkGames(
      supabase,
      apiKey,
      parsed.data.codes,
      { publish: parsed.data.publish, markupPercent },
      admin.id,
    );

    // Imported games change the storefront, so its cached pages are stale.
    revalidatePath("/", "layout");

    return { error: null, summary };
  } catch (error) {
    return { error: errorKey(error), summary: null };
  } finally {
    revalidatePath(`/${locale}/dashboard/providers`);
  }
}
