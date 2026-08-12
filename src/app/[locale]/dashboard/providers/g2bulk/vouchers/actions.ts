"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import { getG2BulkCredentials } from "@/lib/services/admin-settings.service";
import { importG2BulkVouchers } from "@/lib/services/g2bulk-voucher-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { G2BulkError } from "@/providers/g2bulk/errors";
import type { VoucherImportActionState } from "@/app/[locale]/dashboard/providers/g2bulk/vouchers/action-state";

/**
 * Voucher import action.
 *
 * Results are message keys, never prose, so the page renders them in the admin's
 * language. The API key is read here and never returned: a caller only learns
 * whether the import worked.
 */

/**
 * Category ids arrive as form strings. Coerced to integers and capped, because
 * the provider identifies a category by a numeric id and a run should not be able
 * to ask for an unbounded list.
 */
const importSchema = z.object({
  categoryIds: z.array(z.coerce.number().int().positive()).min(1).max(200),
  publish: z.boolean(),
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

export async function importG2BulkVouchersAction(
  _state: VoucherImportActionState,
  formData: FormData,
): Promise<VoucherImportActionState> {
  const admin = await requireAdmin();

  const parsed = importSchema.safeParse({
    // `formTextList` skips absent and empty entries, so an unchecked list simply
    // fails the `min(1)` rule instead of reaching Zod as a null.
    categoryIds: formTextList(formData, "categoryIds"),
    publish: formFlag(formData, "publish"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "no_selection", summary: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const { apiKey, markupPercent } = await getG2BulkCredentials();

  // The catalogue endpoints are public, but a card the store cannot fulfil is
  // worse than one it never listed: the key must be configured first.
  if (!apiKey) {
    return { error: "missing_key", summary: null };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const summary = await importG2BulkVouchers(
      supabase,
      // Duplicate ticks of the same checkbox must not import a category twice.
      [...new Set(parsed.data.categoryIds)],
      { publish: parsed.data.publish, markupPercent },
      admin.id,
    );

    // Imported cards change the storefront, so its cached pages are stale.
    revalidatePath("/", "layout");

    return { error: null, summary };
  } catch (error) {
    return { error: errorKey(error), summary: null };
  } finally {
    revalidatePath(`/${locale}/dashboard/providers`);
  }
}
