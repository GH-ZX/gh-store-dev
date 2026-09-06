import { Form, Link } from "react-router";
import * as UI from "./operations-shared";
export function SupportView({
  view,
}: {
  view: Extract<UI.OperationsView, { kind: "support" }>;
}) {
  const ar = view.locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  return (
    <>
      <UI.Filters
        q=""
        status={view.status}
        options={["all", "open", "pending", "resolved", "closed"]}
        ar={ar}
      />
      {view.queue.threads.length === 0 && (
        <p className="text-ink-muted">
          {t(
            "No support requests match this status.",
            "لا توجد طلبات دعم تطابق هذه الحالة.",
          )}
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_2fr]">
        <section className="grid gap-3">
          {view.queue.threads.map((thread) => (
            <Link
              key={thread.id}
              className={UI.panelClass}
              to={`?status=${view.status}&page=${view.page}&thread=${thread.id}`}
            >
              <strong>{thread.subject}</strong>
              <bdi>{thread.customer.name || thread.customer.email}</bdi>
              <UI.Badge>{thread.status}</UI.Badge>
              <span>
                {thread.messageCount} {t("messages", "رسائل")}
              </span>
              <UI.DateTime value={thread.lastMessageAt} />
            </Link>
          ))}
          <UI.Pager page={view.page} total={view.queue.total} ar={ar} />
        </section>
        {view.conversation?.ok ? (
          <section className={UI.panelClass}>
            <h2 className="text-lg font-bold">
              {view.conversation.thread.subject}
            </h2>
            {view.conversation.messages.map((message) => (
              <article
                key={message.id}
                className="grid gap-2 rounded-xl border border-line p-3"
              >
                <div className="flex flex-wrap gap-3">
                  <UI.Badge>{message.senderRole}</UI.Badge>
                  <UI.DateTime value={message.createdAt} />
                </div>
                <p className="whitespace-pre-wrap">{message.body}</p>
              </article>
            ))}
            <Form method="post" className="grid gap-3">
              <UI.Hidden name="threadId" value={view.conversation.thread.id} />
              <UI.Field label={t("Reply", "الرد")}>
                <textarea
                  className={UI.inputClass}
                  name="body"
                  required
                  maxLength={4000}
                />
              </UI.Field>
              <UI.Submit intent="reply">
                {t("Send reply", "إرسال الرد")}
              </UI.Submit>
            </Form>
            <Form method="post" className="flex flex-wrap gap-3">
              <UI.Hidden name="threadId" value={view.conversation.thread.id} />
              <UI.Field label={t("Status", "الحالة")}>
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
              <UI.Submit intent="thread-status">
                {t("Update status", "تحديث الحالة")}
              </UI.Submit>
            </Form>
          </section>
        ) : (
          <p className="text-ink-muted">
            {view.conversation
              ? t("Conversation unavailable.", "المحادثة غير متاحة.")
              : t(
                  "Select a request to read and reply.",
                  "اختر طلباً لقراءته والرد عليه.",
                )}
          </p>
        )}
      </div>
    </>
  );
}
