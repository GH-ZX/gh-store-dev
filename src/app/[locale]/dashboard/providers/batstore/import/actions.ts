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
import type { UniversalImportActionState } from "@/app/[locale]/dashboard/providers/import/action-state";

const importSchema = z.object({
  productIds: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
  publish: z.boolean(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function importBatStoreAction(
  _state: UniversalImportActionState,
  formData: FormData,
): Promise<UniversalImportActionState> {
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
    const raw = await importBatStoreProducts(
      supabase,
      apiToken,
      selections,
      { publish: parsed.data.publish, markupPercent },
      admin.id,
    );

    revalidatePath("/", "layout");

    return {
      error: null,
      summary: {
        created: raw.created,
        updated: raw.updated,
        failed: raw.failed,
        itemsCreated: 0,
        itemsUpdated: 0,
        errors: raw.outcomes
          .filter((o) => o.error)
          .map((o) => ({ name: o.name, error: o.error! })),
      },
    };
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
