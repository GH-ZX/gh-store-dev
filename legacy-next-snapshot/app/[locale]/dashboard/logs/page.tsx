import type { Metadata } from "next";
import { LogJson, LogRow, LogTime } from "@/components/admin/log-row";
import { LogLevelTabs, LogTabs } from "@/components/admin/log-tabs";
import { Pager, type PagerLabels } from "@/components/admin/pager";
import { EmptyState } from "@/components/shared/states";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { getMessages, type AdminMessages } from "@/i18n/messages";
import { getAppEvents } from "@/lib/logging/axiom-query";
import { logHref, parseLogView, type LogLevelFilter } from "@/lib/logging/log-view";
import { pageCount } from "@/lib/paging";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getAuditLog } from "@/lib/services/admin-audit.service";
import { getRecentSyncLogs } from "@/lib/services/admin-settings.service";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The store's logs: what the code did, what an administrator did, and what the
 * provider syncs recorded.
 *
 * One list at a time. All three used to be stacked with every row's JSON hanging
 * open below it, which made the page a scroll rather than something you could
 * scan — and showed only the first page of each source, with no way to reach the
 * rest. Now the tab, the page and the level filter all live in the URL, so a
 * particular view is a link and the page needs no client JavaScript at all.
 */

type LogsMessages = AdminMessages["logs"];
type ProviderMessages = AdminMessages["providers"]["g2bulk"];

function pagerLabels(messages: LogsMessages): PagerLabels {
  return {
    previous: messages.pagerPrevious,
    next: messages.pagerNext,
    position: messages.pagerPosition,
    positionUnknown: messages.pagerPositionUnknown,
    navLabel: messages.pagerLabel,
  };
}

export default async function LogsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/logs">) {
  const locale = await resolveLocaleParam(params);
  const admin = getMessages(locale, "admin");
  const messages = admin.logs;
  const { view, page, level } = parseLogView(await searchParams);

  return (
    <div className="grid gap-6">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <LogTabs
        locale={locale}
        view={view}
        level={level}
        labels={{
          groupLabel: messages.tabsLabel,
          events: messages.tabEvents,
          actions: messages.tabActions,
          syncs: messages.tabSyncs,
        }}
      />

      {/*
        * Only the active view is fetched. The page used to ask all three sources
        * for their rows on every load and then render one of them.
        */}
      {view === "events" ? (
        <EventsView locale={locale} messages={messages} page={page} level={level} />
      ) : view === "actions" ? (
        <ActionsView locale={locale} messages={messages} page={page} />
      ) : (
        <SyncsView locale={locale} messages={messages} provider={admin.providers.g2bulk} page={page} />
      )}
    </div>
  );
}

/** Level tone doubles as text, never colour alone — the rule the Badge is built on. */
function levelTone(level: string): BadgeTone {
  if (level === "error") {
    return "danger";
  }

  return level === "warn" ? "warning" : "neutral";
}

async function EventsView({
  locale,
  messages,
  page,
  level,
}: {
  locale: Locale;
  messages: LogsMessages;
  page: number;
  level: LogLevelFilter;
}) {
  const result = await getAppEvents({ page, level });

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--ink)]">{messages.eventsTitle}</h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{messages.eventsDescription}</p>
      </div>

      <LogLevelTabs
        locale={locale}
        level={level}
        labels={{
          groupLabel: messages.levelsLabel,
          problems: messages.levelProblems,
          all: messages.levelAll,
          error: messages.levelError,
        }}
      />

      {!result.ok ? (
        <p className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
          {messages.eventsErrors[result.reason]}
        </p>
      ) : (
        <>
          {result.events.length === 0 ? (
            /*
             * Past the end of the list is not the same as an empty one. A page
             * number typed into the URL must not be answered with "nothing has
             * gone wrong", which would be a reassurance nobody checked.
             */
            <p className="text-sm text-[var(--ink-muted)]">
              {page > 1
                ? messages.pageEmpty
                : level === "problems"
                  ? messages.eventsClear
                  : messages.eventsEmpty}
            </p>
          ) : (
            <ul className="grid gap-2">
              {result.events.map((event, index) => (
                <LogRow
                  key={`${event.time}-${index}`}
                  expandLabel={messages.expand}
                  detail={
                    Object.keys(event.fields).length > 0 ? (
                      <LogJson value={event.fields} />
                    ) : undefined
                  }
                  summary={
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={levelTone(event.level)}>{event.level}</Badge>
                        <span className="font-mono text-xs text-[var(--ink-muted)]" dir="ltr">
                          {event.area}
                        </span>
                        <span className="truncate font-mono text-sm text-[var(--ink)]" dir="ltr">
                          {event.event}
                        </span>
                      </span>
                      <LogTime value={event.time} />
                    </div>
                  }
                />
              ))}
            </ul>
          )}

          {/* Renders nothing when the whole list fits on one page. */}
          <Pager
            locale={locale}
            hrefFor={(target) => logHref({ locale, view: "events", level, page: target })}
            page={page}
            pages={result.total === null ? null : pageCount(result.total)}
            hasMore={result.hasMore}
            labels={pagerLabels(messages)}
          />
        </>
      )}
    </section>
  );
}

async function ActionsView({
  locale,
  messages,
  page,
}: {
  locale: Locale;
  messages: LogsMessages;
  page: number;
}) {
  const { entries, total } = await getAuditLog({ page });

  return (
    <section className="grid gap-4">
      <h2 className="text-base font-semibold text-[var(--ink)]">{messages.actionsTitle}</h2>

      {entries.length === 0 ? (
        page > 1 ? (
          <p className="text-sm text-[var(--ink-muted)]">{messages.pageEmpty}</p>
        ) : (
          <EmptyState title={messages.emptyTitle} description={messages.emptyDescription} />
        )
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => (
            <LogRow
              key={entry.id}
              expandLabel={messages.expand}
              detail={
                entry.values && Object.keys(entry.values as object).length > 0 ? (
                  <LogJson value={entry.values} />
                ) : undefined
              }
              summary={
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    {/*
                      * The raw action name. It is a machine word, and inventing a
                      * friendly label per action would silently show nothing for
                      * any action added later.
                      */}
                    <Badge tone="neutral">
                      <span className="font-mono" dir="ltr">
                        {entry.action}
                      </span>
                    </Badge>
                    <span className="truncate text-sm text-[var(--ink)]">
                      {entry.actor.name || entry.actor.email || messages.unknownActor}
                    </span>
                  </span>
                  <LogTime value={entry.createdAt} />
                </div>
              }
            />
          ))}
        </ul>
      )}

      <Pager
        locale={locale}
        hrefFor={(target) => logHref({ locale, view: "actions", page: target })}
        page={page}
        pages={pageCount(total)}
        labels={pagerLabels(messages)}
      />
    </section>
  );
}

function syncTone(status: string): BadgeTone {
  if (status === "succeeded") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  return status === "partial" ? "warning" : "neutral";
}

async function SyncsView({
  locale,
  messages,
  provider,
  page,
}: {
  locale: Locale;
  messages: LogsMessages;
  provider: ProviderMessages;
  page: number;
}) {
  const result = await getRecentSyncLogs(G2BULK_PROVIDER_NAME, { page });

  return (
    <section className="grid gap-4">
      <h2 className="text-base font-semibold text-[var(--ink)]">{messages.syncsTitle}</h2>

      {!result.ok ? (
        <p className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
          {provider.logsUnavailable}
        </p>
      ) : (
        <>
          {result.runs.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">
              {page > 1 ? messages.pageEmpty : provider.logsEmpty}
            </p>
          ) : (
            <ul className="grid gap-2">
              {result.runs.map((run) => (
                <LogRow
                  key={run.id}
                  expandLabel={messages.expand}
                  detail={
                    <div className="grid gap-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-muted)] tabular-nums">
                        <span>
                          {provider.logRequested}: {run.requestedCount}
                        </span>
                        <span>
                          {provider.logCreated}: {run.createdCount}
                        </span>
                        <span>
                          {provider.logUpdated}: {run.updatedCount}
                        </span>
                        {run.failedCount > 0 ? (
                          <span className="text-[var(--danger)]">
                            {provider.logFailed}: {run.failedCount}
                          </span>
                        ) : null}
                      </div>

                      {/* Recorded on every failed run and, until now, never shown. */}
                      {run.errorMessage ? (
                        <p
                          className="font-mono text-[0.6875rem] leading-5 text-[var(--danger)]"
                          dir="ltr"
                        >
                          {run.errorMessage}
                        </p>
                      ) : null}
                    </div>
                  }
                  summary={
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge tone={syncTone(run.status)}>{run.status}</Badge>
                        <span
                          className="truncate font-mono text-xs text-[var(--ink-muted)]"
                          dir="ltr"
                        >
                          {run.kind}
                        </span>
                      </span>
                      <LogTime value={run.startedAt} />
                    </div>
                  }
                />
              ))}
            </ul>
          )}

          <Pager
            locale={locale}
            hrefFor={(target) => logHref({ locale, view: "syncs", page: target })}
            page={page}
            pages={pageCount(result.total)}
            labels={pagerLabels(messages)}
          />
        </>
      )}
    </section>
  );
}
