import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { getMessages } from "@/i18n/messages";
import { accountContext } from "@server/account";
import { sessionCookieHeaders, withSessionCookies } from "@server/session";
import {
  getMySupportThreads,
  getSupportConversation,
  openSupportThread,
  replyToThread,
} from "@server/lib/services/support.service";
import { getSessionSummary } from "@server/lib/services/session.service";
import {
  AccountHeading,
  AccountNavigation,
  AccountCard,
  SubmitButton,
  accountField,
  accountSecondary,
} from "@/components/account-ui";
export async function loader(args: LoaderFunctionArgs) {
  const { supabase, locale, userId, jar, isProduction } =
    await accountContext(args);
  const session = await getSessionSummary(supabase, userId);
  if (session?.isAdmin)
    return withSessionCookies(
      redirect(`/${locale}/dashboard/support`),
      jar,
      isProduction,
    );
  const selected = new URL(args.request.url).searchParams.get("thread");
  const [threads, conversation] = await Promise.all([
    getMySupportThreads(supabase),
    selected
      ? getSupportConversation(supabase, selected)
      : Promise.resolve(null),
  ]);
  return data(
    { locale, threads, conversation, selected },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}
export async function action(args: ActionFunctionArgs) {
  const { supabase, locale, userId, jar, isProduction } =
    await accountContext(args);
  const session = await getSessionSummary(supabase, userId);
  if (session?.isAdmin)
    return withSessionCookies(
      redirect(`/${locale}/dashboard/support`),
      jar,
      isProduction,
    );
  const form = await args.request.formData();
  const body = String(form.get("body") ?? "");
  if (form.get("intent") === "reply") {
    const threadId = String(form.get("threadId") ?? "");
    const result = await replyToThread(supabase, { threadId, body });
    return data(
      { error: result.ok ? null : result.reason, sent: result.ok },
      {
        status: result.ok ? 200 : 400,
        headers: sessionCookieHeaders(jar, isProduction),
      },
    );
  }
  const result = await openSupportThread(supabase, {
    subject: String(form.get("subject") ?? ""),
    body,
  });
  if (result.ok)
    return withSessionCookies(
      redirect(`/${locale}/support?thread=${result.threadId}`),
      jar,
      isProduction,
    );
  return data(
    { error: result.reason, sent: false },
    { status: 400, headers: sessionCookieHeaders(jar, isProduction) },
  );
}
export const meta = () => [{ name: "robots", content: "noindex, nofollow" }];
export default function Support() {
  const { locale, threads, conversation, selected } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const messages = getMessages(locale, "account").support;
  const roles = getMessages(locale, "admin").support.roles;
  const status = (value: string) =>
    messages.statuses[value as keyof typeof messages.statuses] ?? value;
  return (
    <section className="sf-account-page">
      <AccountHeading
        eyebrow={messages.eyebrow}
        title={messages.title}
        description={messages.description}
      />
      <AccountNavigation
        locale={locale}
        messages={getMessages(locale, "account")}
      />
      <div className="sf-support-grid">
        <aside className="sf-support-sidebar">
          <h2 className="text-sm font-semibold">{messages.threadsTitle}</h2>
          <Link to={`/${locale}/support`} className={accountSecondary}>
            {messages.newTitle}
          </Link>
          {!threads.ok ? (
            <p role="alert">{messages.unavailable}</p>
          ) : threads.threads.length ? (
            <ul className="grid gap-2">
              {threads.threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    to={`/${locale}/support?thread=${thread.id}`}
                    aria-current={selected === thread.id ? "page" : undefined}
                    className="sf-support-thread-link"
                  >
                    <span className="block break-words text-sm font-semibold">
                      {thread.subject}
                    </span>
                    <span className="mt-2 block text-xs text-[var(--ink-muted)]">
                      {status(thread.status)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">
              {messages.noThreads}
            </p>
          )}
        </aside>
        <div className="min-w-0">
          {result?.error ? (
            <p role="alert" className="mb-5 text-sm text-[var(--danger)]">
              {messages.errors[result.error as keyof typeof messages.errors] ??
                messages.errors.unknown}
            </p>
          ) : null}
          {result?.sent ? (
            <p role="status" className="mb-5 text-sm text-[var(--success)]">
              {messages.opened}
            </p>
          ) : null}
          {conversation?.ok ? (
            <AccountCard
              title={conversation.thread.subject}
              description={status(conversation.thread.status)}
            >
              <ol className="grid gap-4">
                {conversation.messages.map((message) => (
                  <li
                    key={message.id}
                    className="sf-support-message"
                    data-mine={message.senderRole === "customer" || undefined}
                  >
                    <p className="text-xs font-semibold text-[var(--accent)]">
                      {roles[message.senderRole as keyof typeof roles] ??
                        message.senderRole}
                    </p>
                    <p
                      className="mt-2 whitespace-pre-wrap break-words text-sm leading-7"
                      dir="auto"
                    >
                      {message.body}
                    </p>
                    <time
                      className="mt-3 block text-xs text-[var(--ink-faint)]"
                      dateTime={message.createdAt}
                    >
                      <bdi dir="ltr">
                        {message.createdAt.slice(0, 16).replace("T", " ")}
                      </bdi>
                    </time>
                  </li>
                ))}
              </ol>
              <Form
                key={`${conversation.thread.id}-${conversation.messages.length}`}
                method="post"
                className="mt-6 grid gap-4"
              >
                <input type="hidden" name="intent" value="reply" />
                <input
                  type="hidden"
                  name="threadId"
                  value={conversation.thread.id}
                />
                <label className="grid gap-2 text-sm">
                  {messages.replyLabel}
                  <textarea
                    name="body"
                    className={accountField}
                    rows={4}
                    required
                    maxLength={4000}
                    disabled={conversation.thread.status === "closed"}
                  />
                </label>
                {conversation.thread.status === "closed" ? (
                  <p className="text-sm text-[var(--ink-muted)]">
                    {messages.closedNotice}
                  </p>
                ) : (
                  <SubmitButton>{messages.replyAction}</SubmitButton>
                )}
              </Form>
            </AccountCard>
          ) : conversation ? (
            <AccountCard
              title={messages.missingTitle}
              description={messages.missingDescription}
            >
              <Link to={`/${locale}/support`}>{messages.newTitle}</Link>
            </AccountCard>
          ) : (
            <AccountCard
              title={messages.newTitle}
              description={messages.newDescription}
            >
              <Form method="post" className="grid gap-4">
                <label className="grid gap-2 text-sm">
                  {messages.subjectLabel}
                  <input
                    className={accountField}
                    name="subject"
                    maxLength={200}
                    required
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  {messages.bodyLabel}
                  <textarea
                    className={accountField}
                    rows={6}
                    name="body"
                    maxLength={4000}
                    required
                  />
                  <span className="text-xs text-[var(--ink-muted)]">
                    {messages.bodyHint}
                  </span>
                </label>
                <SubmitButton>{messages.openAction}</SubmitButton>
              </Form>
            </AccountCard>
          )}
        </div>
      </div>
    </section>
  );
}
