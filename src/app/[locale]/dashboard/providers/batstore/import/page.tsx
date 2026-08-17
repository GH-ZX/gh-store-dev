import type { Metadata } from "next";
import Link from "next/link";
import { BatStoreImportForm } from "@/components/admin/batstore-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getBatStoreCredentials } from "@/lib/services/admin-settings.service";
import {
  listAdminCategories,
  type AdminCategory,
} from "@/lib/services/admin-catalog.service";
import {
  loadBatStoreCatalogue,
  type BatStoreImportableProduct,
} from "@/lib/services/batstore-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BatStoreError } from "@/providers/batstore/errors";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * BatStore's catalogue, annotated with what the store already carries.
 *
 * Fetched on the server so the token never leaves it. A provider failure renders
 * as an error panel rather than throwing: which failure it was is the thing an
 * operator needs — a rejected token and a rate limit call for different actions,
 * and this integration has never run against a live key, so a contract failure
 * is a real possibility worth naming.
 */
async function loadCatalogue(): Promise<
  | { ok: true; products: BatStoreImportableProduct[]; categories: AdminCategory[] }
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

    return { ok: true, products, categories };
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
      ) : result.products.length === 0 ? (
        <EmptyState title={page.emptyTitle} description={page.emptyDescription} />
      ) : (
        <BatStoreImportForm
          locale={locale}
          messages={page}
          shared={shared}
          providerErrors={providerErrors}
          products={result.products}
          categories={result.categories}
        />
      )}
    </div>
  );
}