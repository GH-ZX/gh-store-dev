import type { Metadata } from "next";
import { SyncPageClient, type SyncProviderLane } from "@/components/admin/sync-page-client";
import { SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { requireAdmin } from "@/lib/auth/guards";
import {
  getBatStoreCredentials,
  getG2BulkCredentials,
  getMaxStoreCredentials,
} from "@/lib/services/admin-settings.service";
import { loadBatStoreCatalogue } from "@/lib/services/batstore-import.service";
import { loadMaxStoreCatalogue } from "@/lib/services/maxstore-import.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { G2BulkClient } from "@/providers/g2bulk/client";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function loadSyncProviders(locale: Locale): Promise<SyncProviderLane[]> {
  const messages = getMessages(locale, "admin");
  const sync = messages.sync;
  const base = `/${locale}/dashboard`;

  const supabase = await createSupabaseServerClient();

  const [g2bulkKey, maxstoreCreds, batstoreCreds] = await Promise.all([
    getG2BulkCredentials(),
    getMaxStoreCredentials(),
    getBatStoreCredentials(),
  ]);

  const g2bulkMappings = await supabase
    .from("provider_game_mappings")
    .select("external_game_code")
    .eq("provider_name", G2BULK_PROVIDER_NAME);

  const g2bulkImported = new Set(
    (g2bulkMappings.data ?? []).map((row) => row.external_game_code),
  );

  let g2bulkAvailable = 0;
  if (g2bulkKey.apiKey) {
    try {
      const games = await new G2BulkClient({ apiKey: g2bulkKey.apiKey }).listGames();
      g2bulkAvailable = games.length;
    } catch {
      // Provider unavailable
    }
  }

  let maxstoreAvailable = 0;
  let maxstoreImported = 0;
  if (maxstoreCreds.apiToken) {
    try {
      const { categories: msCategories } = await loadMaxStoreCatalogue(
        supabase,
        maxstoreCreds.apiToken,
      );
      maxstoreAvailable = msCategories.reduce((sum, cat) => sum + cat.productCount, 0);
      maxstoreImported = msCategories.reduce(
        (sum, cat) => sum + cat.products.filter((p) => p.alreadyImported).length,
        0,
      );
    } catch {
      // Provider unavailable
    }
  }

  let batstoreAvailable = 0;
  let batstoreImported = 0;
  if (batstoreCreds.apiToken) {
    try {
      const products = await loadBatStoreCatalogue(supabase, batstoreCreds.apiToken);
      batstoreAvailable = products.length;
      batstoreImported = products.filter((p) => p.alreadyImported).length;
    } catch {
      // Provider unavailable
    }
  }

  return [
    {
      key: "g2bulk",
      title: sync.providers.g2bulk.title,
      description: sync.providers.g2bulk.description,
      configured: !!g2bulkKey.apiKey,
      configuredLabel: sync.configured,
      notConfiguredLabel: sync.notConfigured,
      configureHint: sync.configureHint,
      importHref: `${base}/providers/g2bulk/import`,
      importedCount: g2bulkImported.size,
      availableCount: g2bulkAvailable || null,
      importedLabel: sync.importedCount,
      availableLabel: sync.availableCount,
      goToImportLabel: sync.goToImport,
    },
    {
      key: "g2bulkVouchers",
      title: sync.providers.g2bulkVouchers.title,
      description: sync.providers.g2bulkVouchers.description,
      configured: !!g2bulkKey.apiKey,
      configuredLabel: sync.configured,
      notConfiguredLabel: sync.notConfigured,
      configureHint: sync.configureHint,
      importHref: `${base}/providers/g2bulk/vouchers`,
      importedCount: g2bulkImported.size || null,
      availableCount: null,
      importedLabel: sync.importedCount,
      availableLabel: sync.availableCount,
      goToImportLabel: sync.goToImport,
    },
    {
      key: "maxstore",
      title: sync.providers.maxstore.title,
      description: sync.providers.maxstore.description,
      configured: !!maxstoreCreds.apiToken,
      configuredLabel: sync.configured,
      notConfiguredLabel: sync.notConfigured,
      configureHint: sync.configureHint,
      importHref: `${base}/providers/maxstore/import`,
      importedCount: maxstoreImported || null,
      availableCount: maxstoreAvailable || null,
      importedLabel: sync.importedCount,
      availableLabel: sync.availableCount,
      goToImportLabel: sync.goToImport,
    },
    {
      key: "batstore",
      title: sync.providers.batstore.title,
      description: sync.providers.batstore.description,
      configured: !!batstoreCreds.apiToken,
      configuredLabel: sync.configured,
      notConfiguredLabel: sync.notConfigured,
      configureHint: sync.configureHint,
      importHref: `${base}/providers/batstore/import`,
      importedCount: batstoreImported || null,
      availableCount: batstoreAvailable || null,
      importedLabel: sync.importedCount,
      availableLabel: sync.availableCount,
      goToImportLabel: sync.goToImport,
    },
  ];
}

export default async function SyncPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale as Locale;
  await requireAdmin();

  const messages = getMessages(locale, "admin");
  const providers = await loadSyncProviders(locale);

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.sync.eyebrow}
        title={messages.sync.title}
        subtitle={messages.sync.description}
      />

      <SyncPageClient
        locale={locale}
        messages={messages.sync}
        providers={providers}
      />
    </div>
  );
}
