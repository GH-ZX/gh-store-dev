import type { Metadata } from "next";
import { G2BulkSettingsForm } from "@/components/admin/g2bulk-settings-form";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ArrowIcon } from "@/components/ui/icons";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getG2BulkStatus, getRecentSyncLogs } from "@/lib/services/admin-settings.service";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ProvidersPage({ params }: PageProps<"/[locale]/dashboard/providers">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin");
  const provider = messages.providers.g2bulk;
  const [status, logs] = await Promise.all([
    getG2BulkStatus(),
    getRecentSyncLogs(G2BULK_PROVIDER_NAME),
  ]);

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.providers.eyebrow}
        title={messages.providers.title}
        subtitle={messages.providers.description}
      />

      <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-[var(--ink)]">{provider.name}</h2>
              <Badge tone={status.configured ? "success" : "neutral"}>
                {status.configured ? provider.statusConfigured : provider.statusMissing}
              </Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ink-muted)]">
              {provider.summary}
            </p>
            {status.keyHint ? (
              <p className="mt-3 text-xs text-[var(--ink-faint)]">
                {provider.keyHintLabel}: <span dir="ltr">{status.keyHint}</span>
              </p>
            ) : null}
          </div>

          {/* Two import lanes: game top-ups, and gift cards and codes. */}
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--line)] pt-8">
          <G2BulkSettingsForm locale={locale} messages={provider} status={status} />
        </div>
      </section>

      <section className="rounded-[var(--radius-shell)] border border-[var(--line)] bg-[var(--shell)] p-6">
        <h2 className="text-sm font-semibold text-[var(--ink)]">{provider.logsHeading}</h2>

        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">{provider.logsEmpty}</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {logs.map((log) => (
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
                          : log.status === "partial"
                            ? "warning"
                            : "neutral"
                    }
                  >
                    {log.status}
                  </Badge>
                  <span className="text-[var(--ink-muted)] tabular-nums" dir="ltr">
                    {log.startedAt.slice(0, 16).replace("T", " ")}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 text-xs text-[var(--ink-muted)] tabular-nums">
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
