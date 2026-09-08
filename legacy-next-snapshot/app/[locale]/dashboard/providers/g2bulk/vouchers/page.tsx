import type { Metadata } from "next";
import Link from "next/link";
import { UniversalImportForm } from "@/components/admin/universal-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getG2BulkCredentials } from "@/lib/services/admin-settings.service";
import { listAdminCategories } from "@/lib/services/admin-catalog.service";
import {
  loadG2BulkVoucherCatalog,
  toVoucherGameCode,
} from "@/lib/services/g2bulk-voucher-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { G2BulkError } from "@/providers/g2bulk/errors";
import { G2BULK_PROVIDER_NAME, resolveProviderImageUrl } from "@/providers/g2bulk/mapping";
import type { ImportLane } from "@/lib/import/types";
import { INITIAL_UNIVERSAL_IMPORT_STATE } from "@/app/[locale]/dashboard/providers/import/action-state";
import { importG2BulkVouchersAction } from "@/app/[locale]/dashboard/providers/g2bulk/vouchers/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function loadCategories(): Promise<
  { ok: true; lanes: ImportLane[]; categories: NonNullable<Awaited<ReturnType<typeof listAdminCategories>>> } | { ok: false; errorKind: string }
> {
  const { apiKey } = await getG2BulkCredentials();

  if (!apiKey) {
    return { ok: false, errorKind: "missing_key" };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const [groups, mappings, categories] = await Promise.all([
      loadG2BulkVoucherCatalog(),
      supabase
        .from("provider_game_mappings")
        .select("external_game_code")
        .eq("provider_name", G2BULK_PROVIDER_NAME),
      listAdminCategories(),
    ]);

    const imported = new Set((mappings.data ?? []).map((row) => row.external_game_code));

    const items = groups
      .map(({ category, products, hasStock }) => ({
        id: String(category.id),
        name: category.title,
        imageUrl: resolveProviderImageUrl(category.image_url),
        categoryName: category.title,
        available: hasStock,
        alreadyImported: imported.has(toVoucherGameCode(category.id)),
        providerCode: toVoucherGameCode(category.id),
        stockCount: products.length || (category.product_count ?? 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ok: true,
      categories,
      lanes: [
        {
          id: "all",
          name: "All voucher categories",
          hasStock: items.some((i) => i.available),
          alreadyImported: false,
          providerCode: "g2bulk",
          items,
        },
      ],
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
      ) : result.lanes.length === 0 ? (
        <EmptyState
          title={vouchers.emptyTitle}
          description={vouchers.emptyDescription}
        />
      ) : (
        <UniversalImportForm
          locale={locale}
          messages={messages.import}
          providerErrors={providerErrors}
          lanes={result.lanes}
          categories={result.categories}
          formAction={importG2BulkVouchersAction}
          initialState={INITIAL_UNIVERSAL_IMPORT_STATE}
          backHref={`/${locale}/dashboard/providers`}
          viewStoreHref={`/${locale}/games`}
        />
      )}
    </div>
  );
}
