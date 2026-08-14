import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getAuditLog } from "@/lib/services/admin-audit.service";
import { getRecentSyncLogs } from "@/lib/services/admin-settings.service";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LogsPage({ params }: PageProps<"/[locale]/dashboard/logs">) {
  const locale = await resolveLocaleParam(params);
  const messages = getMessages(locale, "admin").logs;
  const provider = getMessages(locale, "admin").providers.g2bulk;
  const [entries, syncs] = await Promise.all([
    getAuditLog(),
    getRecentSyncLogs(G2BULK_PROVIDER_NAME),
  ]);

  return (
    <div className="grid gap-8">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <section>
        <h2 className="text-base font-semibold text-[var(--ink)]">{messages.actionsTitle}</h2>

        {entries.length === 0 ? (
          <EmptyState
            className="mt-4"
            title={messages.emptyTitle}
            description={messages.emptyDescription}
          />
        ) : (
          <ul className="mt-4 grid gap-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      * The raw action name. It is a machine word, and inventing a
                      * friendly label per action would silently show nothing for
                      * any action added later.
                      */}
                    <Badge tone="neutral">
                      <span className="font-mono">{entry.action}</span>
                    </Badge>
                    <span className="text-sm text-[var(--ink)]">
                      {entry.actor.name || entry.actor.email || messages.unknownActor}
                    </span>
                  </div>

                  <time
                    className="text-xs text-[var(--ink-faint)] tabular-nums"
                    dateTime={entry.createdAt}
                    dir="ltr"
                  >
                    {entry.createdAt.slice(0, 16).replace("T", " ")}
                  </time>
                </div>

                {entry.values && Object.keys(entry.values as object).length > 0 ? (
                  <pre
                    className="mt-2 overflow-x-auto rounded-[var(--radius-control)] bg-[var(--shell)] px-3 py-2 font-mono text-[0.6875rem] leading-5 text-[var(--ink-muted)]"
                    dir="ltr"
                  >
                    {JSON.stringify(entry.values, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-[var(--ink)]">{messages.syncsTitle}</h2>

        {syncs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--ink-muted)]">{provider.logsEmpty}</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {syncs.map((log) => (
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
                  <span className="font-mono text-xs text-[var(--ink-muted)]">{log.kind}</span>
                  <span className="text-[var(--ink-faint)] tabular-nums" dir="ltr">
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
