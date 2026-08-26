"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import { getMaxStoreCredentials } from "@/lib/services/admin-settings.service";
import { importMaxStoreCategories } from "@/lib/services/maxstore-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MaxStoreError } from "@/providers/maxstore/errors";
import { MAXSTORE_PROVIDER_NAME } from "@/providers/maxstore/mapping";
import type { UniversalImportActionState } from "@/app/[locale]/dashboard/providers/import/action-state";

const importSchema = z.object({
  categoryIds: z.array(z.string().trim().min(1).max(120)).max(200),
  productIds: z.array(z.string().trim().min(1).max(120)).min(1).max(2000),
  publish: z.boolean(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function importMaxStoreAction(
  _state: UniversalImportActionState,
  formData: FormData,
): Promise<UniversalImportActionState> {
  const admin = await requireAdmin();

  const parsed = importSchema.safeParse({
    categoryIds: formTextList(formData, "categoryIds"),
    productIds: formTextList(formData, "productIds"),
    publish: formFlag(formData, "publish"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "no_selection", summary: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const { apiToken, markupPercent } = await getMaxStoreCredentials();

  if (!apiToken) {
    return { error: "missing_key", summary: null };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const raw = await importMaxStoreCategories(
      supabase,
      apiToken,
      parsed.data.categoryIds,
      { publish: parsed.data.publish, markupPercent },
      admin.id,
      parsed.data.productIds,
    );

    // Assign per-product categories from the form (category-{productId} fields).
    for (const productId of parsed.data.productIds) {
      const formCategoryId = formText(formData, `category-${productId}`);
      if (!formCategoryId) continue;

      const { data: mapping } = await supabase
        .from("provider_offer_mappings")
        .select("offer_id")
        .eq("provider_name", MAXSTORE_PROVIDER_NAME)
        .eq("external_product_id", productId)
        .maybeSingle();

      if (mapping?.offer_id) {
        const { data: offer } = await supabase
          .from("offers")
          .select("game_id")
          .eq("id", mapping.offer_id)
          .maybeSingle();

        if (offer?.game_id) {
          await supabase.from("games").update({ category_id: formCategoryId }).eq("id", offer.game_id);
        }
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
    return {
      error: error instanceof MaxStoreError ? error.kind : "unknown",
      summary: null,
    };
  } finally {
    revalidatePath(`/${locale}/dashboard/providers`);
    revalidatePath(`/${locale}/dashboard/providers/maxstore/import`);
  }
}
