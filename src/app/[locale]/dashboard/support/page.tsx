import type { Metadata } from "next";
import Link from "next/link";
import { AdminReplyForm, StatusButtons } from "@/components/admin/support-queue-forms";
import { Pager } from "@/components/admin/pager";
import { SupportStatusBadge, SupportTimeline } from "@/components/support/support-thread";
import { EmptyState } from "@/components/shared/states";
import { SectionHeader } from "@/components/ui/section";
import type { Locale } from "@/i18n/config";
import { formatMessage, getMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import { pageCount, parsePage, PAGE_SIZE } from "@/lib/paging";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getSupportConversation, getSupportQueue } from "@/lib/services/support.service";
import { isSupportStatus, SUPPORT_STATUSES, type SupportStatus } from "@/lib/support/status";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Deep enough for any real backlog; past it the filter is the better tool. */
const MAX_PAGE = 200;

type Filter = SupportStatus | "all";

function parseFilter(value: string | string[] | undefined): Filter {
  const first = Array.isArray(value) ? value[0] : value;

  return first && isSupportStatus(first) ? first : "all";
}

function queueHref(locale: Locale, filter: Filter, page: number, thread?: string | null): string {
  const params = new URLSearchParams();

  if (filter !== "all") {
    params.set("status", filter);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  if (thread) {
    params.set("thread", thread);
  }

  const query = params.toString();

  return `/${locale}/dashboard/support${query ? `?${query}` : ""}`;
}

/**
 * The owner's support queue.
 *
 * Filter, page and open thread all live in the URL, so a particular view of the
 * backlog is a link and the page needs no client state. The list and the
 * conversation are fetched together rather than the thread being loaded on
 * click: it is one extra query on a page that is already round-tripping, and it
 * keeps the whole surface server-rendered.
 */
export default async function SupportQueuePage({
  params,
  searchParams,
}: PageProps<"/[locale]/dashboard/support">) {
  const locale = await resolveLocaleParam(params);
  const admin = getMessages(locale, "admin");
  const messages = admin.support;
  const query = await searchParams;

  const filter = parseFilter(query.status);
  const page = parsePage(query.page, MAX_PAGE);
  const selectedId = typeof query.thread === "string" ? query.thread : null;

  const [queue, conversation] = await Promise.all([
    getSupportQueue({ status: filter, page }),
    selectedId ? getSupportConversation(selectedId) : Promise.resolve(null),
  ]);

  return (
    <div className="grid gap-6">
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <div
        className="flex w-fit items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--line)] p-0.5"
        role="group"
        aria-label={messages.filtersLabel}
      >
        {(["all", ...SUPPORT_STATUSES] as Filter[]).map((candidate) => {
          const active = candidate === filter;

          return (
            <Link
              key={candidate}
              // The open thread is dropped when the filter changes: it may not
              // be in the new list, and a selection you cannot see is confusing.
              href={queueHref(locale, candidate, 1)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-semibold transition-colors duration-[var(--duration)]",
                active
                  ? "bg-[var(--surface-strong)] text-[var(--ink)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              {candidate === "all" ? messages.filterAll : messages.statuses[candidate]}
            </Link>
          );
        })}
      </div>

      {!queue.ok ? (
        <p className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
          {messages.unavailable}
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-10">
          <div className="grid gap-4">
            {queue.threads.length === 0 ? (
              <p className="text-sm text-[var(--ink-muted)]">{messages.empty}</p>
            ) : (
              <ul className="grid gap-2">
                {queue.threads.map((thread) => {
                  const active = thread.id === selectedId;

                  return (
                    <li key={thread.id}>
                      <Link
                        href={queueHref(locale, filter, page, thread.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "block rounded-[var(--radius-card)] border px-4 py-3 transition-colors duration-[var(--duration)]",
                          active
                            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--surface-strong)]"
                            : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold text-[var(--ink)]">
                            {thread.subject}
                          </span>
                          <SupportStatusBadge
                            status={thread.status}
                            labels={messages.statuses}
                          />
                        </div>

                        <p className="mt-1 truncate text-xs text-[var(--ink-muted)]">
                          {thread.customer.name ||
                            thread.customer.email ||
                            messages.unknownCustomer}
                        </p>

                        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--ink-faint)] tabular-nums">
                          <span dir="ltr">
                            {(thread.lastMessageAt ?? thread.createdAt)
                              .slice(0, 16)
                              .replace("T", " ")}
                          </span>
                          <span>
                            {formatMessage(
                              messages.messagesLabel,
                              { count: thread.messageCount },
                              locale,
                            )}
                          </span>
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            <Pager
              locale={locale}
              hrefFor={(target) => queueHref(locale, filter, target, selectedId)}
              page={page}
              pages={pageCount(queue.total, PAGE_SIZE)}
              labels={{
                previous: admin.logs.pagerPrevious,
                next: admin.logs.pagerNext,
                position: admin.logs.pagerPosition,
                positionUnknown: admin.logs.pagerPositionUnknown,
                navLabel: admin.logs.pagerLabel,
              }}
            />
          </div>

          <div>
            {!conversation ? (
              <p className="text-sm text-[var(--ink-muted)]">{messages.selectPrompt}</p>
            ) : !conversation.ok ? (
              <EmptyState
                title={messages.missingTitle}
                description={messages.missingDescription}
              />
            ) : (
              <div className="grid gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--ink)]">
                    {conversation.thread.subject}
                  </h2>
                  <SupportStatusBadge
                    status={conversation.thread.status}
                    labels={messages.statuses}
                  />
                </div>

                <SupportTimeline
                  messages={conversation.messages}
                  mine="admin"
                  labels={messages.roles}
                />

                <div className="grid gap-5 border-t border-[var(--line)] pt-5">
                  <AdminReplyForm
                    locale={locale}
                    threadId={conversation.thread.id}
                    messages={messages}
                  />

                  <StatusButtons
                    locale={locale}
                    threadId={conversation.thread.id}
                    current={conversation.thread.status}
                    messages={messages}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
