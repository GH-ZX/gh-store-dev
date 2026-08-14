import type { Metadata } from "next";
import Link from "next/link";
import { MaxStoreImportForm } from "@/components/admin/maxstore-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getMaxStoreCredentials } from "@/lib/services/admin-settings.service";
import { loadMaxStoreCatalogue, type MaxStoreCategory } from "@/lib/services/maxstore-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MaxStoreError } from "@/providers/maxstore/errors";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * MaxStore's catalogue, annotated with what the store already carries.
 *
 * Fetched on the server so the token never leaves it. A provider failure renders
 * as an error panel rather than throwing: which failure it was is the thing an
 * operator needs — a rejected token and a rate limit call for different actions,
 * and this integration has never run against a live key, so a contract failure
 * is a real possibility worth naming.
 */
async function loadCategories(): Promise<
  { ok: true; categories: MaxStoreCategory[] } | { ok: false; errorKind: string }
> {
  const { apiToken } = await getMaxStoreCredentials();

  if (!apiToken) {
    return { ok: false, errorKind: "missing_key" };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const { categories } = await loadMaxStoreCatalogue(supabase, apiToken);

    return { ok: true, categories };
  } catch (error) {
    return { ok: false, errorKind: error instanceof MaxStoreError ? error.kind : "unknown" };
  }
}

export default async function MaxStoreImportPage({
  params,
}: PageProps<"/[locale]/dashboard/providers/maxstore/import">) {
  const locale = await resolveLocaleParam(params);
  await requireAdmin();

  const messages = getMessages(locale, "admin");
  const page = messages.providers.maxstoreImport;
  const shared = messages.import;
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
          {shared.backToProviders}
        </Link>

        <SectionHeader
          as="h1"
          eyebrow={messages.providers.maxstore.name}
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
      ) : result.categories.length === 0 ? (
        <EmptyState title={page.emptyTitle} description={page.emptyDescription} />
      ) : (
        <MaxStoreImportForm
          locale={locale}
          messages={page}
          shared={shared}
          providerErrors={providerErrors}
          categories={result.categories}
        />
      )}
    </div>
  );
}
