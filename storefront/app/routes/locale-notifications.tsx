import {
  data,
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { getMessages } from "@/i18n/messages";
import { accountContext } from "@server/account";
import { sessionCookieHeaders } from "@server/session";
import { safeRedirectTarget } from "@server/lib/auth/redirect-target";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@server/lib/services/notification.service";
import {
  AccountHeading,
  AccountNavigation,
  AccountResult,
  SubmitButton,
  accountSecondary,
} from "@/components/account-ui";
export async function loader(args: LoaderFunctionArgs) {
  const { supabase, locale, userId, jar, isProduction } =
    await accountContext(args);
  const notifications = (
    await getMyNotifications(supabase, userId, locale)
  ).map((row) => ({ ...row, href: safeRedirectTarget(row.href) }));
  return data(
    { locale, notifications },
    { headers: sessionCookieHeaders(jar, isProduction) },
  );
}
export async function action(args: ActionFunctionArgs) {
  const { supabase, userId, jar, isProduction } = await accountContext(args);
  const form = await args.request.formData();
  const id = String(form.get("id") ?? "");
  const ok =
    form.get("intent") === "all"
      ? await markAllNotificationsRead(supabase, userId)
      : /^[0-9a-f-]{36}$/i.test(id)
        ? await markNotificationRead(supabase, userId, id)
        : false;
  return data(
    { error: ok ? null : "unknown" },
    {
      status: ok ? 200 : 400,
      headers: sessionCookieHeaders(jar, isProduction),
    },
  );
}
export const meta = () => [{ name: "robots", content: "noindex, nofollow" }];
export default function Notifications() {
  const { locale, notifications } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const account = getMessages(locale, "account"),
    messages = account.notifications;
  return (
    <section className="sf-account-page">
      <AccountHeading
        eyebrow={messages.eyebrow}
        title={messages.title}
        description={messages.description}
      />
      <AccountNavigation locale={locale} messages={account} />
      <AccountResult messages={account} error={result?.error} />
      {notifications.some((row) => !row.isRead) ? (
        <Form method="post" className="mb-6">
          <SubmitButton name="intent" value="all">
            {messages.markAllAction}
          </SubmitButton>
        </Form>
      ) : null}
      {notifications.length ? (
        <ul className="sf-notification-list">
          {notifications.map((row) => (
            <li
              key={row.id}
              className="sf-notification-item"
              data-unread={!row.isRead || undefined}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold">{row.title}</h2>
                {!row.isRead ? (
                  <span className="text-xs font-semibold text-[var(--accent)]">
                    {messages.unreadLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--ink-muted)]">
                {row.body}
              </p>
              <time
                dateTime={row.createdAt}
                className="mt-3 block text-xs text-[var(--ink-faint)]"
              >
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                }).format(new Date(row.createdAt))}
              </time>
              <div className="mt-4 flex flex-wrap gap-3">
                {row.href ? (
                  <a href={row.href} className={accountSecondary}>
                    {messages.openAction}
                  </a>
                ) : null}
                {!row.isRead ? (
                  <Form method="post">
                    <input type="hidden" name="id" value={row.id} />
                    <SubmitButton>
                      {locale === "ar" ? "تحديد كمقروء" : "Mark as read"}
                    </SubmitButton>
                  </Form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sf-account-empty">
          <h2 className="font-semibold">{messages.emptyTitle}</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {messages.emptyDescription}
          </p>
        </div>
      )}
    </section>
  );
}
