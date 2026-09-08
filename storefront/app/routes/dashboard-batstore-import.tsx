import { Link } from "react-router";
import { UniversalImportForm } from "@/components/admin/universal-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireDashboardAdmin } from "@server/dashboard-access";
import { getBatStoreCredentials } from "@server/legacy/lib/services/admin-settings.service";
import { listAdminCategories } from "@server/legacy/lib/services/admin-catalog.service";
import { loadBatStoreCatalogue } from "@server/legacy/lib/services/batstore-import.service";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
import { BatStoreError } from "@server/providers/batstore/errors";
import type { ImportLane } from "@/lib/import/types";
import { INITIAL_UNIVERSAL_IMPORT_STATE } from "@/app/[locale]/dashboard/providers/import/action-state";
import { importBatStoreAction } from "@/lib/admin-actions";


async function loadCatalogue(): Promise<
  | { ok: true; lanes: ImportLane[]; categories: NonNullable<Awaited<ReturnType<typeof listAdminCategories>>> }
  | { ok: false; errorKind: string }
> {
  const { apiToken } = await getBatStoreCredentials();

  if (!apiToken) {
    return { ok: false, errorKind: "missing_key" };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const [products, categories] = await Promise.all([
      loadBatStoreCatalogue(supabase, apiToken),
      listAdminCategories(),
    ]);

    const items = products
      .map((product) => ({
        id: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        price: product.priceUsd,
        available: product.available,
        alreadyImported: product.alreadyImported,
        providerCode: product.providerCode,
        currentCategoryId: product.categoryId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const lanes: ImportLane[] = [
      {
        id: "all",
        name: "All products",
        hasStock: items.some((i) => i.available),
        alreadyImported: false,
        providerCode: "batstore",
        items,
      },
    ];

    return { ok: true, lanes, categories };
  } catch (error) {
    return { ok: false, errorKind: error instanceof BatStoreError ? error.kind : "unknown" };
  }
}


import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { isLocale } from "@/i18n/config";
function requireLocale(value: string | undefined) { if (!value || !isLocale(value)) throw new Response("Not Found", { status: 404 }); return value; }

export async function loader({ params, request }: LoaderFunctionArgs) {
  const locale = requireLocale(params.locale);
  await requireDashboardAdmin(request, locale);

  const result = await loadCatalogue();

  return { locale, result };
}

export default function Page() {
 const { locale, result } = useLoaderData<typeof loader>();
const messages = getMessages(locale, "admin"); const page = messages.providers.batstoreImport; const shared = messages.import; const providerErrors = messages.providers.g2bulk.errors;
  return (
    <div className="grid gap-8">
      <div>
        <Link
          to={`/${locale}/dashboard/providers`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {shared.backToProviders}
        </Link>

        <SectionHeader
          as="h1"
          eyebrow={messages.providers.batstore.name}
          title={page.title}
          subtitle={page.description}
          className="mt-5"
        />
      </div>

      {!result.ok ? (
        <ErrorState
          title={shared.loadFailed}
          description={
            providerErrors[result.errorKind as keyof typeof providerErrors] ?? providerErrors.unknown
          }
        />
      ) : result.lanes.length === 0 ? (
        <EmptyState title={page.emptyTitle} description={page.emptyDescription} />
      ) : (
        <UniversalImportForm
          locale={locale}
          messages={messages.import}
          providerErrors={providerErrors}
          lanes={result.lanes}
          categories={result.categories}
          formAction={importBatStoreAction}
          initialState={INITIAL_UNIVERSAL_IMPORT_STATE}
          backHref={`/${locale}/dashboard/providers`}
          viewStoreHref={`/${locale}/products`}
        />
      )}
    </div>
  );
}
