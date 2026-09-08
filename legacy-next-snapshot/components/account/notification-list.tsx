"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowIcon, CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AccountMessages } from "@/i18n/messages";
import { cn } from "@/lib/cn";
import type { CustomerNotification } from "@/lib/services/notification.service";
import {
  INITIAL_NOTIFICATION_STATE,
  type NotificationActionState,
} from "@/app/[locale]/notifications/action-state";
import { markAllReadAction } from "@/app/[locale]/notifications/actions";

/**
 * The customer's notification list.
 *
 * An unread one is marked by a dot and a heavier surface rather than by colour
 * alone, so it still reads as unread without relying on hue.
 *
 * Stored `href` values carry no locale — the store is bilingual and a
 * notification written months ago should open in whichever language the reader is
 * using now — so the prefix is added here.
 */
export type NotificationListProps = {
  locale: Locale;
  messages: AccountMessages["notifications"];
  notifications: CustomerNotification[];
};

export function NotificationList({ locale, messages, notifications }: NotificationListProps) {
  const [, markAll, pending] = useActionState<NotificationActionState, FormData>(
    markAllReadAction,
    INITIAL_NOTIFICATION_STATE,
  );

  const unread = notifications.filter((notification) => !notification.isRead).length;

  return (
    <div className="grid gap-4">
      {unread > 0 ? (
        <form action={markAll} className="flex items-center justify-between gap-3">
          <input type="hidden" name="locale" value={locale} />
          <Badge tone="warning">{messages.unreadCount.replace("{count}", String(unread))}</Badge>
          <Button type="submit" variant="secondary" disabled={pending} leadingIcon={<CheckIcon />}>
            {messages.markAllAction}
          </Button>
        </form>
      ) : null}

      <ul className="grid gap-2">
        {notifications.map((notification) => {
          const href = notification.href ? `/${locale}${notification.href}` : null;

          const body = (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {!notification.isRead ? (
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-[var(--accent)]"
                  />
                ) : null}
                <p
                  className={cn(
                    "text-sm",
                    notification.isRead
                      ? "text-[var(--ink-soft)]"
                      : "font-semibold text-[var(--ink)]",
                  )}
                >
                  {notification.title}
                </p>
                {!notification.isRead ? (
                  <span className="sr-only">{messages.unreadLabel}</span>
                ) : null}
              </div>

              <p className="mt-1.5 text-sm leading-6 text-[var(--ink-muted)]">{notification.body}</p>

              <time
                className="mt-2 block text-xs text-[var(--ink-faint)] tabular-nums"
                dateTime={notification.createdAt}
                dir="ltr"
              >
                {notification.createdAt.slice(0, 16).replace("T", " ")}
              </time>
            </>
          );

          return (
            <li
              key={notification.id}
              className={cn(
                "rounded-[var(--radius-card)] border px-4 py-3",
                notification.isRead
                  ? "border-[var(--line)] bg-[var(--surface)]"
                  : "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
              )}
            >
              {href ? (
                <Link
                  href={href}
                  className="block transition-opacity duration-[var(--duration)] hover:opacity-80"
                >
                  {body}
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]">
                    {messages.openAction}
                    <ArrowIcon direction="end" className="size-3 rtl:rotate-180" />
                  </span>
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
