import { Link } from "react-router";
import { UniversalImportForm } from "@/components/admin/universal-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireDashboardAdmin } from "@server/dashboard-access";
import { getG2BulkCredentials } from "@server/legacy/lib/services/admin-settings.service";
import { listAdminCategories } from "@server/legacy/lib/services/admin-catalog.service";
import {
  loadG2BulkVoucherCatalog,
  toVoucherGameCode,
} from "@server/legacy/lib/services/g2bulk-voucher-import.service";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
import { G2BulkError } from "@server/providers/g2bulk/errors";
import { G2BULK_PROVIDER_NAME, resolveProviderImageUrl } from "@server/providers/g2bulk/mapping";
import type { ImportLane } from "@/lib/import/types";
import { INITIAL_UNIVERSAL_IMPORT_STATE } from "@/app/[locale]/dashboard/providers/import/action-state";
import { importG2BulkVouchersAction } from "@/lib/admin-actions";


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


import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
function requireLocale(value: string | undefined) { if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 }); return value; }

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale);
  await requireDashboardAdmin(request, locale);

  const result = await loadCategories();

  return { locale, result };
}

export default function Page() {
 const { locale, result } = useLoaderData<typeof loader>();
const messages = getMessages(locale, "admin"); const vouchers = messages.vouchers; const providerErrors = messages.providers.g2bulk.errors;
  return (
    <div className="grid gap-8">
      <div>
        <Link
          to={`/${locale}/dashboard/providers`}
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
          viewStoreHref={`/${locale}/products`}
        />
      )}
    </div>
  );
}
