import type { Metadata } from "next";
import { AxiomSettingsForm } from "@/components/admin/axiom-settings-form";
import { FulfillmentPolicyForm } from "@/components/admin/fulfillment-policy-form";
import { BatStoreSettingsForm } from "@/components/admin/batstore-settings-form";
import { BinanceSettingsForm } from "@/components/admin/binance-settings-form";
import { G2BulkSettingsForm } from "@/components/admin/g2bulk-settings-form";
import { MaxStoreSettingsForm } from "@/components/admin/maxstore-settings-form";
import { ProviderGroup, ProviderSection } from "@/components/admin/provider-section";
import { SamSettingsForm } from "@/components/admin/sam-settings-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getSamOverview } from "@/lib/services/admin-sam.service";
import {
  getAxiomStatus,
  getBatStoreStatus,
  getBinanceStatus,
  getFulfillmentSettings,
  getG2BulkCallback,
  getG2BulkStatus,
  getMaxStoreStatus,
  getRecentSyncLogs,
  getSamStatus,
} from "@/lib/services/admin-settings.service";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Every outside service the store talks to.
 *
 * Grouped by the job each one does and folded away individually. Three
 * always-open panels was a readable page; a store ends up with a supplier per
 * catalogue it resells and a processor per payment method, and at that length
 * the open list becomes something nobody scrolls. The summary row carries the
 * state, so the page is scanned rather than read.
 *
 * Every read here is admin-gated in its own service, and nothing that reaches a
 * component carries a secret — only masked hints.
 */
export default async function ProvidersPage({ params }: PageProps<"/[locale]/dashboard/providers">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");
  const provider = messages.providers.g2bulk;
  const maxstore = messages.providers.maxstore;
  const batstore = messages.providers.batstore;
  const sam = messages.providers.sam;
  const binance = messages.providers.binance;
  const logging = messages.providers.logging;
  const fulfillmentPolicy = messages.providers.fulfillmentPolicy;
  const groups = messages.providers.groups;
  const secrets = messages.providers.secrets;
  const [status, callback, maxstoreStatus, batstoreStatus, logs, samStatus, binanceStatus, samOverview, axiomStatus, fulfillmentSettings] =
    await Promise.all([
      getG2BulkStatus(),
      getG2BulkCallback(),
      getMaxStoreStatus(),
      getBatStoreStatus(),
      getRecentSyncLogs(G2BULK_PROVIDER_NAME),
      getSamStatus(),
      getBinanceStatus(),
      // Reaches Sam when a key is stored, and answers with an error key rather
      // than throwing, so a provider outage cannot take this page down.
      getSamOverview(),
      getAxiomStatus(),
      getFulfillmentSettings(),
    ]);

  return (
    <div className="grid gap-10">
      <SectionHeader
        as="h1"
        eyebrow={messages.providers.eyebrow}
        title={messages.providers.title}
        subtitle={messages.providers.description}
      />

      <ProviderGroup title={groups.suppliers} description={groups.suppliersDescription}>
        <ProviderSection
          name={provider.name}
          summary={provider.summary}
          defaultOpen={!status.configured}
          badges={[
            {
              label: status.configured ? provider.statusConfigured : provider.statusMissing,
              tone: status.configured ? "success" : "neutral",
            },
            ...(status.webhookConfigured
              ? [{ label: provider.callbackOn, tone: "success" as const }]
              : []),
          ]}
          hint={status.keyHint ? { label: provider.keyHintLabel, value: status.keyHint } : null}
          actions={
            <>
              {/* Two import lanes: game top-ups, and gift cards and codes. */}
              <ButtonLink
                href={`/${locale}/dashboard/providers/g2bulk/import`}
                variant={status.configured ? "primary" : "secondary"}
                trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
              >
                {provider.importAction}
              </ButtonLink>
              <ButtonLink
                href={`/${locale}/dashboard/providers/g2bulk/vouchers`}
                variant="secondary"
                trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
              >
                {messages.vouchers.title}
              </ButtonLink>
            </>
          }
        >
          <G2BulkSettingsForm
            locale={locale}
            messages={provider}
            status={status}
            callback={callback}
            secrets={secrets}
          />
        </ProviderSection>

        <ProviderSection
          name={maxstore.name}
          summary={maxstore.summary}
          defaultOpen={!maxstoreStatus.configured}
          badges={[
            {
              label: maxstoreStatus.configured ? maxstore.statusConfigured : maxstore.statusMissing,
              tone: maxstoreStatus.configured ? "success" : "neutral",
            },
            // Said in the summary, not only inside: a supplier that cannot yet
            // sell anything should not look finished from the outside.
            { label: maxstore.partialLabel, tone: "warning" },
          ]}
          hint={
            maxstoreStatus.tokenHint
              ? { label: maxstore.keyHintLabel, value: maxstoreStatus.tokenHint }
              : null
          }
          actions={
            <ButtonLink
              href={`/${locale}/dashboard/providers/maxstore/import`}
              variant={maxstoreStatus.configured ? "primary" : "secondary"}
              trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
            >
              {messages.providers.maxstoreImport.title}
            </ButtonLink>
          }
        >
          <MaxStoreSettingsForm
            locale={locale}
            messages={maxstore}
            errors={provider.errors}
            status={maxstoreStatus}
            secrets={secrets}
          />
        </ProviderSection>

        <ProviderSection
          name={batstore.name}
          summary={batstore.summary}
          defaultOpen={!batstoreStatus.configured}
          badges={[
            {
              label: batstoreStatus.configured ? batstore.statusConfigured : batstore.statusMissing,
              tone: batstoreStatus.configured ? "success" : "neutral",
            },
            // Said in the summary, not only inside: a supplier that cannot yet
            // sell anything should not look finished from the outside.
            { label: batstore.partialLabel, tone: "warning" },
          ]}
          hint={
            batstoreStatus.tokenHint
              ? { label: batstore.keyHintLabel, value: batstoreStatus.tokenHint }
              : null
          }
          actions={
            <ButtonLink
              href={`/${locale}/dashboard/providers/batstore/import`}
              variant={batstoreStatus.configured ? "primary" : "secondary"}
              trailingIcon={<ArrowIcon direction="end" className="rtl:rotate-180" />}
            >
              {messages.providers.batstoreImport.title}
            </ButtonLink>
          }
        >
          <BatStoreSettingsForm
            locale={locale}
            messages={batstore}
            errors={provider.errors}
            status={batstoreStatus}
            secrets={secrets}
          />
        </ProviderSection>
      </ProviderGroup>

      <ProviderGroup title={groups.payments} description={groups.paymentsDescription}>
        <ProviderSection
          name={sam.name}
          summary={sam.summary}
          defaultOpen={!samStatus.configured}
          badges={[
            {
              label: samStatus.configured ? sam.statusConfigured : sam.statusMissing,
              tone: samStatus.configured ? "success" : "neutral",
            },
            ...(samStatus.configured && samStatus.manualReview
              ? [{ label: sam.manualReviewLabel, tone: "warning" as const }]
              : []),
          ]}
          hint={samStatus.keyHint ? { label: sam.keyHintLabel, value: samStatus.keyHint } : null}
        >
          <SamSettingsForm
            locale={locale}
            messages={sam}
            status={samStatus}
            overview={samOverview}
            secrets={secrets}
          />
        </ProviderSection>

        <ProviderSection
          name={binance.name}
          summary={binance.summary}
          defaultOpen={!binanceStatus.configured}
          badges={[
            {
              label: binanceStatus.configured ? binance.statusConfigured : binance.statusMissing,
              tone: binanceStatus.configured ? "success" : "neutral",
            },
            // Configured and offered are different things here, and the badge
            // has to say which one this is.
            ...(binanceStatus.configured && !binanceStatus.enabled
              ? [{ label: binance.offLabel, tone: "warning" as const }]
              : []),
          ]}
          hint={
            binanceStatus.keyHint ? { label: binance.keyHintLabel, value: binanceStatus.keyHint } : null
          }
        >
          <BinanceSettingsForm
            locale={locale}
            messages={binance}
            errors={provider.errors}
            status={binanceStatus}
            secrets={secrets}
          />
        </ProviderSection>
      </ProviderGroup>

      <ProviderGroup title={groups.operations} description={groups.operationsDescription}>
        <ProviderSection
          name={fulfillmentPolicy.name}
          summary={fulfillmentPolicy.summary}
          defaultOpen={true}
          badges={[
            {
              label: fulfillmentSettings.refundOnFailure
                ? fulfillmentPolicy.refundEnabled
                : fulfillmentPolicy.refundDisabled,
              tone: fulfillmentSettings.refundOnFailure ? "success" : "warning",
            },
          ]}
        >
          <FulfillmentPolicyForm
            locale={locale}
            refundOnFailure={fulfillmentSettings.refundOnFailure}
            messages={fulfillmentPolicy}
            errors={provider.errors}
          />
        </ProviderSection>
      </ProviderGroup>

      <ProviderGroup title={groups.monitoring} description={groups.monitoringDescription}>
        <ProviderSection
          name={logging.name}
          summary={logging.summary}
          defaultOpen={!axiomStatus.enabled}
          badges={[
            {
              label: axiomStatus.enabled ? logging.statusConfigured : logging.statusMissing,
              tone: axiomStatus.enabled ? "success" : "neutral",
            },
          ]}
          hint={
            axiomStatus.tokenHint
              ? { label: logging.tokenHint, value: axiomStatus.tokenHint }
              : null
          }
        >
          <AxiomSettingsForm locale={locale} messages={logging} status={axiomStatus} secrets={secrets} />
        </ProviderSection>
      </ProviderGroup>

      <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ink)]">{provider.logsHeading}</h2>

        {!logs.ok ? (
          <p className="mt-3 text-sm text-[var(--warning)]">{provider.logsUnavailable}</p>
        ) : logs.runs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">{provider.logsEmpty}</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {logs.runs.map((log) => (
              <li
                key={log.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      log.status === "succeeded"
                        ? "success"
                        : log.status === "failed"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {log.status}
                  </Badge>
                  <span className="text-[var(--ink-soft)]">{log.kind}</span>
                  <time className="text-xs text-[var(--ink-faint)] tabular-nums" dateTime={log.startedAt} dir="ltr">
                    {log.startedAt.slice(0, 16).replace("T", " ")}
                  </time>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-muted)] tabular-nums">
                  <span>
                    {provider.logRequested}: {log.requestedCount}
                  </span>
                  <span>
                    {provider.logCreated}: {log.createdCount}
                  </span>
                  <span>
                    {provider.logUpdated}: {log.updatedCount}
                  </span>
                  {log.failedCount > 0 ? (
                    <span className="text-[var(--danger)]">
                      {provider.logFailed}: {log.failedCount}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
