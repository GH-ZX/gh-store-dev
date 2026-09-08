import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewThreadForm, ReplyForm } from "@/components/support/support-forms";
import { SupportStatusBadge, SupportTimeline } from "@/components/support/support-thread";
import { EmptyState } from "@/components/shared/states";
import { Section, SectionHeader } from "@/components/ui/section";
import { getMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import { resolveLocaleParam } from "@/lib/routing/locale-params";
import { getSessionSummary } from "@/lib/services/session.service";
import { getMySupportThreads, getSupportConversation } from "@/lib/services/support.service";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Where a customer raises a problem and reads the answer.
 *
 * The open thread lives in the URL (`?thread=`) rather than in component state,
 * so the page stays a server component, a particular conversation is a link, and
 * a reply re-renders the timeline without any client-side cache to keep honest.
 */
export default async function SupportPage({
  params,
  searchParams,
}: PageProps<"/[locale]/support">) {
  const locale = await resolveLocaleParam(params);
  const account = getMessages(locale, "account");
  const messages = account.support;
  const admin = getMessages(locale, "admin");
  const session = await getSessionSummary();

  if (!session) {
    redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/support`)}`);
  }

  // The admin manages support from the dashboard, not the customer support page.
  if (session.isAdmin) {
    redirect(`/${locale}/dashboard/support`);
  }

  const query = await searchParams;
  const selectedId = typeof query.thread === "string" ? query.thread : null;

  const [threads, conversation] = await Promise.all([
    getMySupportThreads(),
    selectedId ? getSupportConversation(selectedId) : Promise.resolve(null),
  ]);

  return (
    <Section spacing="page" mesh>
      <SectionHeader
        as="h1"
        eyebrow={messages.eyebrow}
        title={messages.title}
        subtitle={messages.description}
      />

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-10">
        <div className="grid gap-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{messages.threadsTitle}</h2>

          {!threads.ok ? (
            <p className="rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
              {messages.unavailable}
            </p>
          ) : threads.threads.length === 0 ? (
            <p className="text-sm text-[var(--ink-muted)]">{messages.noThreads}</p>
          ) : (
            <ul className="grid gap-2">
              {threads.threads.map((thread) => {
                const active = thread.id === selectedId;

                return (
                  <li key={thread.id}>
                    <Link
                      href={`/${locale}/support?thread=${thread.id}`}
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
                        <SupportStatusBadge status={thread.status} labels={messages.statuses} />
                      </div>
                      <p
                        className="mt-1 text-xs text-[var(--ink-faint)] tabular-nums"
                        dir="ltr"
                      >
                        {(thread.lastMessageAt ?? thread.createdAt).slice(0, 16).replace("T", " ")}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid gap-6">
          {conversation?.ok ? (
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
                mine="customer"
                labels={admin.support.roles}
              />

              <div className="border-t border-[var(--line)] pt-5">
                <ReplyForm
                  locale={locale}
                  threadId={conversation.thread.id}
                  closed={conversation.thread.status === "closed"}
                  messages={messages}
                />
              </div>
            </div>
          ) : conversation && !conversation.ok ? (
            <EmptyState title={messages.missingTitle} description={messages.missingDescription} />
          ) : (
            <div className="grid gap-5">
              <div>
                <h2 className="text-base font-semibold text-[var(--ink)]">{messages.newTitle}</h2>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{messages.newDescription}</p>
              </div>

              <NewThreadForm locale={locale} messages={messages} />
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
