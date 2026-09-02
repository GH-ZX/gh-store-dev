"use client";

import { useActionState, useState } from "react";
import {
  AdminCard,
  CheckboxField,
  FormResult,
  TextAreaField,
  TextField,
} from "@/components/admin/admin-form";
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
  saveRechargeMethodsAction,
  saveRechargeSettingsAction,
} from "@/app/[locale]/dashboard/recharges/actions";
import { formatPrice } from "@/lib/format/money";
import { BYBIT_METHOD_TEMPLATE, type RechargeMethod } from "@/lib/settings/recharge-settings";
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
 * Limits for manual top-up requests.
 *
 * There is no automatic-crediting switch here on purpose. A manual transfer
 * carries no proof that money arrived — a customer saying they sent it is a
 * claim — so every manual request is reviewed, and the panel says so rather than
 * offering a toggle that would let anyone fund themselves for free.
 *
 * Automatic crediting exists only for Sam API payments, where the server can ask
 * the provider whether the transfer really happened. That switch lives with the
 * Sam API settings on the APIs page.
 */
export function RechargeSettingsForm({
  locale,
  messages,
  minAmount,
  maxAmount,
}: {
  locale: Locale;
  messages: Messages;
  minAmount: number;
  maxAmount: number;
}) {
  const [state, formAction, pending] = useActionState<AdminRechargeState, FormData>(
    saveRechargeSettingsAction,
    INITIAL_ADMIN_RECHARGE_STATE,
  );

  return (
    <AdminCard
      title={messages.limitsTitle}
      description={messages.limitsDescription}
      actions={<Badge tone="neutral">{messages.reviewAlways}</Badge>}
    >
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />

        <p
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-muted)]"
          role="note"
        >
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-[var(--ink-faint)]" />
          {messages.manualReviewNote}
        </p>

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
          notice={state.notice === "auto_saved" ? messages.limitsSaved : null}
        />

        <div>
          <Button type="submit" disabled={pending}>
            {messages.limitsSaveAction}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}

type MethodDraft = {
  id: string;
  labelAr: string;
  labelEn: string;
  account: string;
  instructionsAr: string;
  instructionsEn: string;
  enabled: boolean;
};

function toDraft(method: RechargeMethod): MethodDraft {
  return {
    id: method.id,
    labelAr: method.labelAr,
    labelEn: method.labelEn,
    account: method.account ?? "",
    instructionsAr: method.instructionsAr,
    instructionsEn: method.instructionsEn,
    enabled: method.enabled,
  };
}

const BYBIT_DRAFT: MethodDraft = {
  id: BYBIT_METHOD_TEMPLATE.id,
  labelAr: BYBIT_METHOD_TEMPLATE.label_ar,
  labelEn: BYBIT_METHOD_TEMPLATE.label_en,
  account: BYBIT_METHOD_TEMPLATE.account,
  instructionsAr: BYBIT_METHOD_TEMPLATE.instructions_ar,
  instructionsEn: BYBIT_METHOD_TEMPLATE.instructions_en,
  enabled: BYBIT_METHOD_TEMPLATE.enabled,
};

function emptyDraft(): MethodDraft {
  return {
    id: "",
    labelAr: "",
    labelEn: "",
    account: "",
    instructionsAr: "",
    instructionsEn: "",
    enabled: false,
  };
}

/**
 * Manual recharge methods — what a customer picks on the add-balance page.
 *
 * The editor is one client-owned list that saves as a single JSON field. Every
 * method arrives disabled unless it is explicitly turned on, so a half-filled
 * row can never leak to a customer.
 */
export function RechargeMethodsForm({
  locale,
  messages,
  methods,
}: {
  locale: Locale;
  messages: Messages;
  methods: RechargeMethod[];
}) {
  const [drafts, setDrafts] = useState<MethodDraft[]>(() => methods.map(toDraft));
  const [state, formAction, pending] = useActionState<AdminRechargeState, FormData>(
    saveRechargeMethodsAction,
    INITIAL_ADMIN_RECHARGE_STATE,
  );

  function update(index: number, patch: Partial<MethodDraft>) {
    setDrafts((current) =>
      current.map((draft, currentIndex) =>
        currentIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function remove(index: number) {
    setDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function add(draft: MethodDraft) {
    setDrafts((current) => {
      if (current.some((existing) => existing.id.trim() === draft.id.trim())) {
        return current;
      }

      return [...current, draft];
    });
  }

  const payload = JSON.stringify(
    drafts.map((draft) => ({
      id: draft.id.trim(),
      label_ar: draft.labelAr.trim(),
      label_en: draft.labelEn.trim(),
      account: draft.account.trim(),
      instructions_ar: draft.instructionsAr.trim(),
      instructions_en: draft.instructionsEn.trim(),
      enabled: draft.enabled,
    })),
  );

  const hasBybit = drafts.some((draft) => draft.id.trim() === BYBIT_DRAFT.id);

  return (
    <AdminCard title={messages.methodsTitle} description={messages.methodsDescription}>
      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="methods" value={payload} />

        {drafts.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--ink-muted)]">
            {messages.methodsDescription}
          </p>
        ) : (
          <ul className="grid gap-3">
            {drafts.map((draft, index) => (
              <li
                key={index}
                className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <CheckboxField
                    label={messages.methodEnabled}
                    checked={draft.enabled}
                    onChange={(event) => update(index, { enabled: event.target.checked })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => remove(index)}
                    className="text-[var(--danger)]"
                  >
                    {messages.removeMethod}
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <TextField
                    label={messages.methodId}
                    value={draft.id}
                    onChange={(event) => update(index, { id: event.target.value })}
                    dir="ltr"
                    required
                    maxLength={40}
                    placeholder="bybit"
                    className="font-mono"
                  />
                  <TextField
                    label={messages.methodLabelEn}
                    value={draft.labelEn}
                    onChange={(event) => update(index, { labelEn: event.target.value })}
                    maxLength={80}
                  />
                  <TextField
                    label={messages.methodLabelAr}
                    value={draft.labelAr}
                    onChange={(event) => update(index, { labelAr: event.target.value })}
                    maxLength={80}
                  />
                </div>

                <div className="mt-3">
                  <TextField
                    label={messages.methodAccount}
                    value={draft.account}
                    onChange={(event) => update(index, { account: event.target.value })}
                    dir="ltr"
                    maxLength={160}
                    className="font-mono"
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextAreaField
                    label={messages.methodInstructionsEn}
                    value={draft.instructionsEn}
                    onChange={(event) => update(index, { instructionsEn: event.target.value })}
                    maxLength={600}
                  />
                  <TextAreaField
                    label={messages.methodInstructionsAr}
                    value={draft.instructionsAr}
                    onChange={(event) => update(index, { instructionsAr: event.target.value })}
                    maxLength={600}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <FormResult
          error={resolveError(messages, state.error)}
          notice={state.notice === "methods_saved" ? messages.methodsSaved : null}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {messages.saveMethods}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => add(BYBIT_DRAFT)}
            disabled={hasBybit || pending}
          >
            {messages.addBybit}
          </Button>
          <Button type="button" variant="secondary" onClick={() => add(emptyDraft())} disabled={pending}>
            {messages.addMethod}
          </Button>
        </div>
      </form>
    </AdminCard>
  );
}
