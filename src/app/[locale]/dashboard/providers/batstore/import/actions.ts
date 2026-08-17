"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import { getBatStoreCredentials } from "@/lib/services/admin-settings.service";
import { importBatStoreProducts } from "@/lib/services/batstore-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BatStoreError } from "@/providers/batstore/errors";
import type { BatStoreImportActionState } from "@/app/[locale]/dashboard/providers/batstore/import/action-state";

/**
 * BatStore catalogue import.
 *
 * Its own module beside the screen it serves, matching the other supplier
 * lanes. Each selected product becomes its own container with one offer, and the
 * store category it lands in is chosen per row on the picker. The markup comes
 * from the saved BatStore settings rather than the form: pricing is a decision
 * made once on the provider panel, and an import that could quietly carry a
 * different one would make two places disagree about what the store charges.
 */
const importSchema = z.object({
  productIds: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
  publish: z.boolean(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function importBatStoreAction(
  _state: BatStoreImportActionState,
  formData: FormData,
): Promise<BatStoreImportActionState> {
  const admin = await requireAdmin();

  const parsed = importSchema.safeParse({
    productIds: formTextList(formData, "productIds"),
    publish: formFlag(formData, "publish"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "no_selection", summary: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const { apiToken, markupPercent } = await getBatStoreCredentials();

  if (!apiToken) {
    return { error: "missing_key", summary: null };
  }

  const supabase = await createSupabaseServerClient();

  const selections = parsed.data.productIds.map((productId) => {
    const category = formText(formData, `category-${productId}`);

    return {
      productId,
      categoryId: category && category.length > 0 ? category : null,
    };
  });

  try {
    const summary = await importBatStoreProducts(
      supabase,
      apiToken,
      selections,
      { publish: parsed.data.publish, markupPercent },
      admin.id,
    );

    // Imported products change the storefront, so its cached pages are stale.
    revalidatePath("/", "layout");

    return { error: null, summary };
  } catch (error) {
    return {
      error: error instanceof BatStoreError ? error.kind : "unknown",
      summary: null,
    };
  } finally {
    revalidatePath(`/${locale}/dashboard/providers`);
    revalidatePath(`/${locale}/dashboard/providers/batstore/import`);
  }
}