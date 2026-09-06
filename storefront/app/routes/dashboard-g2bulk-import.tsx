import { Link } from "react-router";
import { UniversalImportForm } from "@/components/admin/universal-import-form";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { ChevronIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { requireAdmin } from "@server/lib/auth/guards";
import { getG2BulkCredentials } from "@server/legacy/lib/services/admin-settings.service";
import { listAdminCategories } from "@server/legacy/lib/services/admin-catalog.service";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
import { G2BulkClient } from "@server/providers/g2bulk/client";
import { G2BulkError } from "@server/providers/g2bulk/errors";
import { G2BULK_PROVIDER_NAME, resolveProviderImageUrl } from "@server/providers/g2bulk/mapping";
import type { ImportLane } from "@/lib/import/types";
import { INITIAL_UNIVERSAL_IMPORT_STATE } from "@/app/[locale]/dashboard/providers/import/action-state";
import { importG2BulkGamesAction } from "@/lib/admin-actions";


async function loadGames(): Promise<
  { ok: true; lanes: ImportLane[]; categories: NonNullable<Awaited<ReturnType<typeof listAdminCategories>>> } | { ok: false; errorKind: string }
> {
  const { apiKey } = await getG2BulkCredentials();

  if (!apiKey) {
    return { ok: false, errorKind: "missing_key" };
  }

  const supabase = await createSupabaseServerClient();

  try {
    const [providerGames, mappings, categories] = await Promise.all([
      new G2BulkClient({ apiKey }).listGames(),
      supabase
        .from("provider_game_mappings")
        .select("external_game_code")
        .eq("provider_name", G2BULK_PROVIDER_NAME),
      listAdminCategories(),
    ]);

    const imported = new Set((mappings.data ?? []).map((row) => row.external_game_code));

    const items = providerGames
      .map((game) => ({
        id: game.code,
        name: game.name,
        imageUrl: resolveProviderImageUrl(game.image_url),
        available: true,
        alreadyImported: imported.has(game.code),
        providerCode: game.code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      ok: true,
      categories,
      lanes: [
        {
          id: "all",
          name: "All products",
          hasStock: true,
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

export async function loader({ params }: LoaderFunctionArgs) {
  await requireAdmin();
  const locale = requireLocale(params.locale);
  await requireAdmin();

  const result = await loadGames();

  return { locale, result };
}

export default function Page() {
 const { locale, result } = useLoaderData<typeof loader>();
const messages = getMessages(locale, "admin"); const providerErrors = messages.providers.g2bulk.errors;
  return (
    <div className="grid gap-8">
      <div>
        <Link
          to={`/${locale}/dashboard/providers`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--ink-muted)] transition-colors duration-[var(--duration)] hover:text-[var(--ink)]"
        >
          <ChevronIcon direction="start" className="size-4 rtl:rotate-180" />
          {messages.import.backToProviders}
        </Link>

        <SectionHeader
          as="h1"
          eyebrow={messages.import.eyebrow}
          title={messages.import.title}
          subtitle={messages.import.description}
          className="mt-5"
        />
      </div>

      {!result.ok ? (
        <ErrorState
          title={messages.import.loadFailed}
          description={
            providerErrors[result.errorKind as keyof typeof providerErrors] ?? providerErrors.unknown
          }
          action={{
            href: `/${locale}/dashboard/providers`,
            label: messages.import.backToProviders,
          }}
        />
      ) : result.lanes.length === 0 ? (
        <EmptyState
          title={messages.import.emptyTitle}
          description={messages.import.emptyDescription}
        />
      ) : (
        <UniversalImportForm
          locale={locale}
          messages={messages.import}
          providerErrors={providerErrors}
          lanes={result.lanes}
          categories={result.categories}
          formAction={importG2BulkGamesAction}
          initialState={INITIAL_UNIVERSAL_IMPORT_STATE}
          backHref={`/${locale}/dashboard/providers`}
          viewStoreHref={`/${locale}/products`}
        />
      )}
    </div>
  );
}
