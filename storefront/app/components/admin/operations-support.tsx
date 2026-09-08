import { Form, Link, useSearchParams } from "react-router";
import * as UI from "./operations-shared";
import { cn } from "@/lib/cn";
import { SupportIcon, UserIcon } from "@/components/ui/icons";

export function SupportView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "support" }>;
}) {
  const [searchParams] = useSearchParams();
  const currentThreadId = searchParams.get("thread");
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  return (
    <div className="space-y-6">
      {/* Filter Toolbar */}
      <UI.Filters
        q=""
        status={view.status}
        options={["all", "open", "pending", "resolved", "closed"]}
        ar={ar}
      />

      {view.queue.threads.length === 0 && (
        <div className="admin-card py-10 text-center text-sm text-[var(--ink-muted)]">
          {t(
            "No support requests match this status.",
            "لا توجد طلبات دعم تطابق هذه الحالة.",
          )}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.8fr]">
        {/* Left Column: Thread List */}
        <section className="space-y-3">
          {view.queue.threads.map((thread) => {
            const isSelected = thread.id === currentThreadId;

            return (
              <Link
                key={thread.id}
                className={cn(
                  "admin-card block space-y-2 p-4 transition-all duration-150",
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--surface-strong)] shadow-xs"
                    : "hover:border-[var(--line-strong)]",
                )}
                to={`?status=${view.status}&page=${view.page}&thread=${thread.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <strong className="text-sm font-bold text-[var(--ink)] line-clamp-1">
                    {thread.subject}
                  </strong>
                  <UI.Badge>{thread.status}</UI.Badge>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                  <UserIcon className="size-3 shrink-0" />
                  <span className="truncate">
                    <bdi>{thread.customer.name || thread.customer.email}</bdi>
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--ink-faint)] pt-1 border-t border-[var(--line)]">
                  <span className="admin-badge admin-badge-neutral text-[11px] py-0 px-2">
                    {thread.messageCount} {t("messages", "رسائل")}
                  </span>
                  <UI.DateTime value={thread.lastMessageAt} />
                </div>
              </Link>
            );
          })}

          <UI.Pager page={view.page} total={view.queue.total} ar={ar} />
        </section>

        {/* Right Column: Conversation */}
        {view.conversation?.ok ? (
          <section className="admin-card space-y-6">
            <div className="border-b border-[var(--line)] pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-[var(--ink)]">
                  {view.conversation.thread.subject}
                </h2>
                <UI.Badge>{view.conversation.thread.status}</UI.Badge>
              </div>
            </div>

            {/* Message Bubble List */}
            <div className="space-y-3">
              {view.conversation.messages.map((message) => {
                const isAdmin = message.senderRole === "admin";

                return (
                  <article
                    key={message.id}
                    className={cn(
                      "rounded-lg p-4 space-y-2 text-xs sm:text-sm leading-relaxed border",
                      isAdmin
                        ? "border-[var(--accent-line)] bg-[var(--accent-soft)]/20 ms-4 sm:ms-8"
                        : "border-[var(--line)] bg-[var(--surface-inset)] me-4 sm:me-8",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs border-b border-[var(--line)] pb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            isAdmin
                              ? "admin-badge admin-badge-accent font-bold"
                              : "admin-badge admin-badge-neutral"
                          }
                        >
                          {isAdmin ? t("Support Team", "فريق الدعم") : t("Customer", "العميل")}
                        </span>
                      </div>
                      <UI.DateTime value={message.createdAt} />
                    </div>

                    <p className="whitespace-pre-wrap text-[var(--ink)] pt-1">
                      {message.body}
                    </p>
                  </article>
                );
              })}
            </div>

            {/* Reply Form */}
            <Form method="post" className="space-y-3 pt-4 border-t border-[var(--line)]">
              <UI.Hidden name="threadId" value={view.conversation.thread.id} />
              <UI.Field label={t("Reply to customer", "الرد على العميل")}>
                <textarea
                  className={UI.inputClass}
                  name="body"
                  required
                  rows={3}
                  maxLength={4000}
                  placeholder={t("Type your response...", "اكتب رسالتك أو الحل هنا...")}
                />
              </UI.Field>
              <div>
                <UI.Submit intent="reply" variant="primary">
                  {t("Send reply", "إرسال الرد")}
                </UI.Submit>
              </div>
            </Form>

            {/* Update Status Form */}
            <Form method="post" className="flex flex-wrap items-end gap-3 pt-3 border-t border-[var(--line)]">
              <UI.Hidden name="threadId" value={view.conversation.thread.id} />
              <div className="min-w-44">
                <UI.Field label={t("Thread status", "حالة المحادثة")}>
                  <select
                    className={UI.inputClass}
                    name="status"
                    defaultValue={view.conversation.thread.status}
                  >
                    {["open", "pending", "resolved", "closed"].map((status) => (
                      <option key={status} value={status}>
                        {UI.statusLabel(status, view.locale, view.section)}
                      </option>
                    ))}
                  </select>
                </UI.Field>
              </div>
              <UI.Submit intent="thread-status" variant="secondary">
                {t("Update status", "تحديث الحالة")}
              </UI.Submit>
            </Form>
          </section>
        ) : (
          <div className="admin-card py-16 text-center text-sm text-[var(--ink-muted)] space-y-2">
            <SupportIcon className="size-8 mx-auto text-[var(--ink-muted)] opacity-60" />
            <p>
              {view.conversation
                ? t("Conversation unavailable.", "المحادثة غير متاحة.")
                : t(
                    "Select a request to read and reply.",
                    "اختر طلباً لقراءته والرد عليه.",
                  )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
