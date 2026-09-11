

import { revalidatePath } from "@server/compat/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@server/lib/auth/guards";
import { formFlag, formText, formTextList } from "@/lib/forms/form-data";
import { removeImportedProduct } from "@server/legacy/lib/services/admin-catalog.service";
import { getBatStoreCredentials } from "@server/legacy/lib/services/admin-settings.service";
import { importBatStoreProducts } from "@server/legacy/lib/services/batstore-import.service";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
import { BatStoreError } from "@server/providers/batstore/errors";
import { BATSTORE_PROVIDER_NAME } from "@server/providers/batstore/mapping";
import type { UniversalImportActionState } from "@/app/[locale]/dashboard/providers/import/action-state";

const importSchema = z.object({
  productIds: z.array(z.string().trim().min(1).max(120)).max(500),
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

  const productIds = formTextList(formData, "productIds");
  const removedCodes = formTextList(formData, "removedCodes");

  if (productIds.length === 0 && removedCodes.length === 0) {
    return { error: "no_selection", summary: null };
  }

  const parsed = importSchema.safeParse({
    productIds,
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
    let deletedCount = 0;
    for (const code of removedCodes) {
      try {
        const res = await removeImportedProduct(code, BATSTORE_PROVIDER_NAME);
        if (res.ok) deletedCount++;
      } catch {}
    }

    let raw = {
      created: 0,
      updated: 0,
      failed: 0,
      outcomes: [] as Array<{ name: string; error?: string }>,
    };

    if (selections.length > 0) {
      raw = await importBatStoreProducts(
        supabase,
        apiToken,
        selections,
        { publish: parsed.data.publish, markupPercent },
        admin.id,
      );
    }

    revalidatePath("/", "layout");

    return {
      error: null,
      summary: {
        created: raw.created,
        updated: raw.updated,
        deleted: deletedCount,
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
