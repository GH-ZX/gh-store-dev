"use client";

import { useActionState } from "react";
import { AdminCard, FormResult } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatMessage } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages";
import type { LastReconcileRun } from "@/lib/services/reconciliation.service";
import {
  INITIAL_RECONCILE_STATE,
  type ReconcileState,
} from "@/app/[locale]/dashboard/orders/reconcile-action-state";
import { runReconciliationAction } from "@/app/[locale]/dashboard/orders/reconcile-actions";

type Messages = AdminMessages["orders"];

/**
 * The state of the sweep that finishes stuck orders.
 *
 * Shown here rather than buried in a logs page because a sweep that has quietly
 * stopped looks exactly like a store with no stuck orders, and the difference is
 * customers who paid and are still waiting. The last run's time is the part that
 * matters: if it is old, nothing is finishing orders any more.
 */
export function ReconcilePanel({
  locale,
  messages,
  lastRun,
}: {
  locale: Locale;
  messages: Messages;
  lastRun: LastReconcileRun | null;
}) {
  const [state, action, pending] = useActionState<ReconcileState, FormData>(
    runReconciliationAction,
    INITIAL_RECONCILE_STATE,
  );

  const notice =
    state.notice === "ran" && state.summary
      ? formatMessage(messages.reconcileRan, state.summary, locale)
      : null;

  return (
    <AdminCard
      title={messages.reconcileTitle}
      description={messages.reconcileDescription}
      actions={
        lastRun && lastRun.escalated > 0 ? (
          <Badge tone="warning">
            {formatMessage(messages.reconcileNeedsAttention, { count: lastRun.escalated }, locale)}
          </Badge>
        ) : null
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-[var(--ink-muted)]">
          {lastRun ? (
            <>
              {messages.reconcileLastRun}:{" "}
              <span className="text-[var(--ink)] tabular-nums" dir="ltr">
                {(lastRun.finishedAt ?? lastRun.startedAt).slice(0, 16).replace("T", " ")}
              </span>{" "}
              <span className="text-[var(--ink-faint)]">
                (
                {formatMessage(
                  messages.reconcileCounts,
                  {
                    checked: lastRun.checked,
                    completed: lastRun.completed,
                    refunded: lastRun.refunded,
                  },
                  locale,
                )}
                )
              </span>
            </>
          ) : (
            messages.reconcileNeverRun
          )}
        </p>

        <form action={action}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {messages.reconcileAction}
          </Button>
        </form>

        <FormResult error={state.error ? messages.errors.unknown : null} notice={notice} />
      </div>
    </AdminCard>
  );
}
