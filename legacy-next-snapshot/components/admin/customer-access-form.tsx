"use client";

import { useActionState } from "react";
import { AdminCard, FormResult } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_ACCESS_STATE,
  type AccessState,
} from "@/app/[locale]/dashboard/customers/access-action-state";
import {
  setActiveAction,
  setRoleAction,
} from "@/app/[locale]/dashboard/customers/access-actions";

type Messages = AdminMessages["customers"];
type ErrorKey = keyof Messages["accessErrors"];

/**
 * Who this person is allowed to be.
 *
 * Promoting an administrator used to be a SQL statement run by hand, and
 * suspending an account had no control at all despite the status being shown
 * everywhere.
 *
 * Each change is its own form so neither can be submitted by a stray Enter in
 * the other, and the buttons are absent rather than disabled for the changes the
 * server would refuse — an owner should not be able to click their own lockout
 * and be told no.
 */
export function CustomerAccessForm({
  locale,
  messages,
  userId,
  isSelf,
  isAdmin,
  isActive,
}: {
  locale: Locale;
  messages: Messages;
  userId: string;
  /** True when an administrator is looking at their own account. */
  isSelf: boolean;
  isAdmin: boolean;
  isActive: boolean;
}) {
  const [roleState, roleAction, changingRole] = useActionState<AccessState, FormData>(
    setRoleAction,
    INITIAL_ACCESS_STATE,
  );
  const [activeState, activeAction, changingActive] = useActionState<AccessState, FormData>(
    setActiveAction,
    INITIAL_ACCESS_STATE,
  );

  const errorKey = roleState.error ?? activeState.error;
  const noticeKey = roleState.notice ?? activeState.notice;
  const busy = changingRole || changingActive;

  return (
    <AdminCard title={messages.accessTitle} description={messages.accessDescription}>
      {isSelf ? (
        <p
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-muted)]"
          role="note"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--ink-faint)]" />
          {messages.accessSelfNote}
        </p>
      ) : (
        <div className="grid gap-3">
          <form action={roleAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="role" value={isAdmin ? "customer" : "admin"} />
            <Button type="submit" variant="secondary" size="sm" disabled={busy}>
              {isAdmin ? messages.demoteAction : messages.promoteAction}
            </Button>
            <span className="text-xs leading-5 text-[var(--ink-faint)]">
              {isAdmin ? messages.demoteHelp : messages.promoteHelp}
            </span>
          </form>

          <form
            action={activeAction}
            className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="active" value={isActive ? "false" : "true"} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={busy}
              className={isActive ? "text-[var(--danger)]" : undefined}
            >
              {isActive ? messages.suspendAction : messages.reactivateAction}
            </Button>
            <span className="text-xs leading-5 text-[var(--ink-faint)]">
              {isActive ? messages.suspendHelp : messages.reactivateHelp}
            </span>
          </form>
        </div>
      )}

      <div className="mt-4">
        <FormResult
          error={errorKey ? (messages.accessErrors[errorKey as ErrorKey] ?? messages.accessErrors.unknown) : null}
          notice={noticeKey ? messages.accessNotices[noticeKey as keyof Messages["accessNotices"]] : null}
        />
      </div>
    </AdminCard>
  );
}
