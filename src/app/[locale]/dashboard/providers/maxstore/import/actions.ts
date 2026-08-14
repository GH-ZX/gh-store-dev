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
import type { MaxStoreImportActionState } from "@/app/[locale]/dashboard/providers/maxstore/import/action-state";

/**
 * MaxStore catalogue import.
 *
 * Its own module beside the screen it serves, matching the voucher lane. The
 * markup comes from the saved MaxStore settings rather than the form: pricing is
 * a decision made once on the provider panel, and an import that could quietly
 * carry a different one would make two places disagree about what the store
 * charges.
 */
const importSchema = z.object({
  categoryIds: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
  publish: z.boolean(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function importMaxStoreAction(
  _state: MaxStoreImportActionState,
  formData: FormData,
): Promise<MaxStoreImportActionState> {
  const admin = await requireAdmin();

  const parsed = importSchema.safeParse({
    categoryIds: formTextList(formData, "categoryIds"),
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
    const summary = await importMaxStoreCategories(
      supabase,
      apiToken,
      parsed.data.categoryIds,
      { publish: parsed.data.publish, markupPercent },
      admin.id,
    );

    // Imported products change the storefront, so its cached pages are stale.
    revalidatePath("/", "layout");

    return { error: null, summary };
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
