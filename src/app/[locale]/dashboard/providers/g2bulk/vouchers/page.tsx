import type { Metadata } from "next";
import Link from "next/link";
import {
  G2BulkVoucherImportForm,
  type ImportableVoucherCategory,
} from "@/components/admin/g2bulk-voucher-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getG2BulkCredentials } from "@/lib/services/admin-settings.service";
import {
  loadG2BulkVoucherCatalog,
  toVoucherGameCode,
} from "@/lib/services/g2bulk-voucher-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { G2BulkError } from "@/providers/g2bulk/errors";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Provider voucher categories, annotated with what the store already carries.
 *
 * Fetched on the server so the API key never leaves it — the catalogue endpoints
 * themselves are public and are called without the key. A provider failure is
 * rendered as an error panel rather than thrown: the admin needs to read which
 * failure it was, especially a rejected key.
 */
async function loadCategories(): Promise<
  { ok: true; categories: ImportableVoucherCategory[] } | { ok: false; errorKind: string }
> {
  const { apiKey } = await getG2BulkCredentials();

  // Cards can be listed without a key but never delivered without one, so the key
  // is required before anything reaches the storefront.
  if (!apiKey) {
    return { ok: false, errorKind: "missing_key" };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const [groups, mappings] = await Promise.all([
      loadG2BulkVoucherCatalog(),
      supabase
        .from("provider_game_mappings")
        .select("external_game_code")
        .eq("provider_name", G2BULK_PROVIDER_NAME),
    ]);

    const imported = new Set((mappings.data ?? []).map((row) => row.external_game_code));

    return {
      ok: true,
      categories: groups
        .map(({ category, products, hasStock }) => ({
          id: category.id,
          title: category.title,
          // The live product list is the truth; `product_count` from the provider
          // is the fallback when a category returns no products in this response.
          productCount: products.length || (category.product_count ?? 0),
          hasStock,
          alreadyImported: imported.has(toVoucherGameCode(category.id)),
          providerCode: toVoucherGameCode(category.id),
        }))
        .sort((first, second) => first.title.localeCompare(second.title)),
    };
  } catch (error) {
    return { ok: false, errorKind: error instanceof G2BulkError ? error.kind : "unknown" };
  }
}

export default async function G2BulkVoucherImportPage({
  params,
}: PageProps<"/[locale]/dashboard/providers/g2bulk/vouchers">) {
  const locale = await resolveLocaleParam(params);
  await requireAdmin();

  const messages = getMessages(locale, "admin");
  const vouchers = messages.vouchers;
  const providerErrors = messages.providers.g2bulk.errors;
  const result = await loadCategories();

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href={`/${locale}/dashboard/providers`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {vouchers.backToProviders}
        </Link>

        <SectionHeader
          as="h1"
          eyebrow={vouchers.eyebrow}
          title={vouchers.title}
          subtitle={vouchers.description}
          className="mt-5"
        />
      </div>

      {!result.ok ? (
        <ErrorState
          title={vouchers.loadFailed}
          description={
            providerErrors[result.errorKind as keyof typeof providerErrors] ?? providerErrors.unknown
          }
          action={{
            href: `/${locale}/dashboard/providers`,
            label: vouchers.backToProviders,
          }}
        />
      ) : result.categories.length === 0 ? (
        <EmptyState
          title={vouchers.emptyTitle}
          description={vouchers.emptyDescription}
        />
      ) : (
        <G2BulkVoucherImportForm
          locale={locale}
          messages={vouchers}
          shared={messages.import}
          providerErrors={providerErrors}
          categories={result.categories}
        />
      )}
    </div>
  );
}
