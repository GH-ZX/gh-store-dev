"use client";

import { useActionState } from "react";
import { AdminCard, CheckboxField, FormResult, TextField } from "@/components/admin/admin-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_ADMIN_RECHARGE_STATE,
  type AdminRechargeState,
} from "@/app/[locale]/dashboard/recharges/action-state";
import {
  approveRechargeAction,
  rejectRechargeAction,
  saveRechargeSettingsAction,
} from "@/app/[locale]/dashboard/recharges/actions";
import { formatPrice } from "@/lib/format/money";
import type { AdminRechargeRequest } from "@/lib/services/admin-recharge.service";

type Messages = AdminMessages["recharges"];
type ErrorKey = keyof Messages["errors"];

function resolveError(messages: Messages, key: string | null): string | null {
  return key ? (messages.errors[key as ErrorKey] ?? messages.errors.unknown) : null;
}

/**
 * Review one request.
 *
 * Approve and reject are separate forms, so a reject can never be submitted by a
 * stray Enter in the approve amount. The credited amount defaults to the request:
 * a customer may send a different sum than they typed, and the approver records
 * what actually arrived.
 */
export function RechargeReviewCard({
  locale,
  messages,
  request,
}: {
  locale: Locale;
  messages: Messages;
  request: AdminRechargeRequest;
}) {
  const [approveState, approve, approving] = useActionState<AdminRechargeState, FormData>(
    approveRechargeAction,
    INITIAL_ADMIN_RECHARGE_STATE,
  );
  const [rejectState, reject, rejecting] = useActionState<AdminRechargeState, FormData>(
    rejectRechargeAction,
    INITIAL_ADMIN_RECHARGE_STATE,
  );

  const error = resolveError(messages, approveState.error ?? rejectState.error);
  const notice =
    approveState.notice === "approved"
      ? messages.approved
      : rejectState.notice === "rejected"
        ? messages.rejected
        : null;

  return (
    <li className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            {request.customer.name || request.customer.email}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--ink-muted)]" dir="ltr">
            {request.customer.email}
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--ink-faint)]" dir="ltr">
            {request.reference} · {request.paymentMethod}
          </p>
        </div>

        <div className="text-end">
          <p className="text-lg font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
            {formatPrice(request.requestedAmount, request.currency, locale)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-faint)] tabular-nums" dir="ltr">
            {request.createdAt.slice(0, 16).replace("T", " ")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-[var(--line)] pt-4">
        <form action={approve} className="grid gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="requestId" value={request.id} />

          <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            <TextField
              label={messages.creditAmountLabel}
              hint={messages.creditAmountHint}
              name="creditAmount"
              type="number"
              step="0.01"
              min={0.01}
              placeholder={String(request.requestedAmount)}
              dir="ltr"
              className="tabular-nums"
            />
            <TextField label={messages.noteLabel} name="note" maxLength={280} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={approving || rejecting}>
              {messages.approveAction}
            </Button>
          </div>
        </form>

        <form action={reject}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="requestId" value={request.id} />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={approving || rejecting}
            className="text-[var(--danger)]"
          >
            {messages.rejectAction}
          </Button>
        </form>

        <FormResult error={error} notice={notice} />
      </div>
    </li>
  );
}

/**
 * Automatic crediting.
 *
 * The warning is not decoration. A manual method carries no proof that money
 * arrived, so turning this on lets anyone credit themselves for free. It is off
 * unless the owner deliberately enables it.
 */
export function RechargeSettingsForm({
  locale,
  messages,
  autoApprove,
  minAmount,
  maxAmount,
}: {
  locale: Locale;
  messages: Messages;
  autoApprove: boolean;
  minAmount: number;
  maxAmount: number;
}) {
  const [state, formAction, pending] = useActionState<AdminRechargeState, FormData>(
    saveRechargeSettingsAction,
    INITIAL_ADMIN_RECHARGE_STATE,
  );

  return (
    <AdminCard
      title={messages.autoTitle}
      description={messages.autoDescription}
      actions={
        <Badge tone={autoApprove ? "warning" : "neutral"}>
          {autoApprove ? messages.autoOn : messages.autoOff}
        </Badge>
      }
    >
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />

        <p
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3 text-sm leading-6 text-[var(--warning)]"
          role="note"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0" />
          {messages.autoWarning}
        </p>

        <CheckboxField
          label={messages.autoEnableLabel}
          name="autoApprove"
          defaultChecked={autoApprove}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={messages.minAmount}
            name="minAmount"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={minAmount}
            required
            dir="ltr"
            className="tabular-nums"
          />
          <TextField
            label={messages.maxAmount}
            name="maxAmount"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={maxAmount}
            required
            dir="ltr"
            className="tabular-nums"
          />
        </div>

        <FormResult
          error={resolveError(messages, state.error)}
          notice={state.notice === "auto_saved" ? messages.autoSaved : null}
        />

        <div>
          <Button type="submit" disabled={pending}>
            {messages.autoSaveAction}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}
