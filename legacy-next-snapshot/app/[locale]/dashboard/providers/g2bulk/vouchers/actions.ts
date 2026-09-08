"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import { getG2BulkCredentials } from "@/lib/services/admin-settings.service";
import { importG2BulkVouchers, toVoucherGameCode } from "@/lib/services/g2bulk-voucher-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { G2BulkError } from "@/providers/g2bulk/errors";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import type { UniversalImportActionState } from "@/app/[locale]/dashboard/providers/import/action-state";

/**
 * Voucher import action.
 *
 * Accepts `productIds` (universal form) — each id is a numeric category id
 * that arrives as a string. The old `categoryIds` field is also accepted for
 * backwards compatibility with the standalone voucher page.
 */
const importSchema = z.object({
  categoryIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
  publish: z.boolean(),
  locale: z.string().optional(),
});

function resolveLocale(value: unknown): Locale {
  return typeof value === "string" && isLocale(value) ? value : DEFAULT_LOCALE;
}

function errorKey(error: unknown): string {
  return error instanceof G2BulkError ? error.kind : "unknown";
}

export async function importG2BulkVouchersAction(
  _state: UniversalImportActionState,
  formData: FormData,
): Promise<UniversalImportActionState> {
  const admin = await requireAdmin();

  // Accept both "productIds" (universal) and "categoryIds" (legacy)
  const rawIds = formTextList(formData, "productIds").length > 0
    ? formTextList(formData, "productIds")
    : formTextList(formData, "categoryIds");

  const parsed = importSchema.safeParse({
    categoryIds: rawIds,
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
    const raw = await importG2BulkVouchers(
      supabase,
      [...new Set(parsed.data.categoryIds)],
      { publish: parsed.data.publish, markupPercent },
      admin.id,
    );

    // Assign per-product categories from the form (category-{id} fields).
    for (const categoryId of parsed.data.categoryIds) {
      const catIdStr = String(categoryId);
      const formCategoryId = formText(formData, `category-${catIdStr}`);
      if (!formCategoryId) continue;

      const gameCode = toVoucherGameCode(categoryId);
      const { data: mapping } = await supabase
        .from("provider_game_mappings")
        .select("game_id")
        .eq("provider_name", G2BULK_PROVIDER_NAME)
        .eq("external_game_code", gameCode)
        .maybeSingle();

      if (mapping?.game_id) {
        await supabase.from("products").update({ category_id: formCategoryId }).eq("id", mapping.game_id);
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
