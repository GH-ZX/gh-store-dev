import type { Metadata } from "next";
import Link from "next/link";
import { UniversalImportForm } from "@/components/admin/universal-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getBatStoreCredentials } from "@/lib/services/admin-settings.service";
import { listAdminCategories } from "@/lib/services/admin-catalog.service";
import { loadBatStoreCatalogue } from "@/lib/services/batstore-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BatStoreError } from "@/providers/batstore/errors";
import type { ImportLane } from "@/lib/import/types";
import { INITIAL_UNIVERSAL_IMPORT_STATE } from "@/app/[locale]/dashboard/providers/import/action-state";
import { importBatStoreAction } from "@/app/[locale]/dashboard/providers/batstore/import/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };

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

export default async function BatStoreImportPage({
  params,
}: PageProps<"/[locale]/dashboard/providers/batstore/import">) {
  const locale = await resolveLocaleParam(params);
  await requireAdmin();

  const messages = getMessages(locale, "admin");
  const page = messages.providers.batstoreImport;
  const shared = messages.import;
  const providerErrors = messages.providers.g2bulk.errors;
  const result = await loadCatalogue();

  return (
    <div className="grid gap-8">
      <div>
        <Link
          href={`/${locale}/dashboard/providers`}
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
          viewStoreHref={`/${locale}/games`}
        />
      )}
    </div>
  );
}
