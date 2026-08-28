"use client";

import { useActionState, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  checkoutFieldName,
  INITIAL_CHECKOUT_STATE,
  type CheckoutActionState,
} from "@/app/[locale]/checkout/action-state";
import {
  prefillGiftFieldsAction,
  placeOrderAction,
  type GiftPrefillResult,
} from "@/app/[locale]/checkout/actions";
import { FormResult, SelectField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { CheckoutMessages } from "@/i18n/messages";
import { formatPrice } from "@/lib/format/money";
import type { StoreInputField } from "@/lib/services/catalog.service";

/**
 * The account details a supplier needs, plus the confirm control.
 *
 * The only client-side state is the idempotency key, generated once per mount and
 * submitted with the form. A double-clicked button, a resubmitted page, or a
 * retried request therefore all carry the same key, and the checkout transaction
 * replays the first order instead of buying twice.
 *
 * The field list is rendered from the offer, but it is also re-read server-side:
 * nothing here is trusted as the definition of what the supplier requires.
 */
export type CheckoutFormProps = {
  locale: Locale;
  messages: CheckoutMessages;
  gameSlug: string;
  offerSlug: string;
  fields: StoreInputField[];
  /** Set when the wallet balance does not cover the total. */
  disabled: boolean;
  /** The quoted total, for the sticky bar's amount. A quote, never arithmetic. */
  total: number;
  currency: string;
  /** Server-decided balance after purchase; null on the admin gift path. */
  balanceAfter: number | null;
  /**
   * Admin checkout. The admin has no wallet; their order is a gift. Shows the
   * recipient prefill and a confirm button that does not talk about paying.
   */
  gift?: boolean;
};

type ErrorKey = keyof CheckoutMessages["errors"];

/**
 * Stable id for the checkout form, so the sticky bar's submit button — portaled
 * outside of it — can still point at it with the `form` attribute.
 */
const CHECKOUT_FORM_ID = "gh-checkout-form";

/** Only genuinely Latin values get an explicit direction. */
const LTR_FIELD_TYPES: StoreInputField["fieldType"][] = ["number", "email", "uid"];

function inputType(fieldType: StoreInputField["fieldType"]): string {
  if (fieldType === "number") {
    return "number";
  }

  return fieldType === "email" ? "email" : "text";
}

/** Gift prefill runs async outside the checkout form's own submit. */
type GiftPrefillFailure = Extract<GiftPrefillResult, { ok: false }>;
type PrefillState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok" }
  | { status: "error"; reason: GiftPrefillFailure["reason"] };

export function CheckoutForm({
  locale,
  messages,
  gameSlug,
  offerSlug,
  fields,
  disabled,
  total,
  currency,
  balanceAfter,
  gift = false,
}: CheckoutFormProps) {
  const [state, formAction, pending] = useActionState<CheckoutActionState, FormData>(
    placeOrderAction,
    INITIAL_CHECKOUT_STATE,
  );

  /*
   * The sticky bar is portaled to <body>, because the page template wrapper
   * keeps `filter: blur(0)` from its entrance animation (fill-mode: both), and
   * a non-`none` filter makes an ancestor the containing block for `fixed`
   * children — a plain fixed bar would anchor to the bottom of the document,
   * not the viewport. The form attribute keeps it a real submit control of the
   * form it lives outside of.
   */
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  // Tied to this mount, not to each submit, so a retry of the same intent stays
  // the same operation.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const formRef = useRef<HTMLFormElement>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [prefill, setPrefill] = useState<PrefillState>({ status: "idle" });
  const [isPrefilling, startPrefill] = useTransition();

  const error = state.error
    ? (messages.errors[state.error as ErrorKey] ?? messages.errors.unknown)
    : null;

  function fillFields(fields: Record<string, string>): void {
    const form = formRef.current;

    if (!form) {
      return;
    }

    for (const [fieldKey, value] of Object.entries(fields)) {
      const control = form.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${checkoutFieldName(fieldKey)}"]`,
      );

      if (control) {
        control.value = value;
      }
    }
  }

  function runPrefill(): void {
    const email = recipientEmail.trim();

    if (!email) {
      setPrefill({ status: "error", reason: "not_found" });
      return;
    }

    setPrefill({ status: "loading" });

    startPrefill(async () => {
      const result = await prefillGiftFieldsAction(email, gameSlug, offerSlug);

      if (!result.ok) {
        setPrefill({ status: "error", reason: result.reason });
        return;
      }

      fillFields(result.fields);
      setPrefill({ status: "ok" });
    });
  }

  const prefillError =
    prefill.status === "error" ? (messages.fields.giftRecipientErrors?.[prefill.reason] ?? "") : null;

  const submitLabel = pending
    ? messages.fields.submitPending
    : gift
      ? messages.fields.giftSubmitAction
      : messages.fields.submitAction;

  return (
    <>
      <form
        ref={formRef}
        id={CHECKOUT_FORM_ID}
        action={formAction}
        className="grid gap-5"
      >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="gameSlug" value={gameSlug} />
      <input type="hidden" name="offerSlug" value={offerSlug} />
      <input type="hidden" name="quantity" value="1" />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {gift ? (
        <div className="grid gap-3 rounded-[var(--radius-control)] border border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <TextField
                label={messages.fields.giftRecipientLabel}
                hint={messages.fields.giftRecipientHint}
                name="giftRecipientEmail"
                type="email"
                inputMode="email"
                dir="ltr"
                required={false}
                autoComplete="off"
                onChange={(event) => setRecipientEmail(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="md"
              disabled={isPrefilling}
              onClick={runPrefill}
            >
              {isPrefilling
                ? messages.fields.giftPrefillPending
                : messages.fields.giftPrefillAction}
            </Button>
          </div>
          {prefill.status === "ok" ? (
            <p className="text-sm text-[var(--ink-muted)]">{messages.fields.giftPrefillDone}</p>
          ) : null}
          {prefill.status === "error" ? (
            <p className="text-sm text-[var(--danger)]">{prefillError}</p>
          ) : null}
        </div>
      ) : null}

      {fields.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const mark = field.isRequired
              ? messages.fields.requiredMark
              : messages.fields.optionalMark;
            const label = `${field.label} ${mark}`;
            const name = checkoutFieldName(field.fieldKey);

            if (field.fieldType === "select" || field.options.length > 0) {
              return (
                <SelectField
                  key={field.id}
                  label={label}
                  hint={field.placeholder ?? undefined}
                  name={name}
                  required={field.isRequired}
                  defaultValue=""
                  options={[
                    { value: "", label: messages.fields.selectPlaceholder },
                    ...field.options,
                  ]}
                />
              );
            }

            return (
              <TextField
                key={field.id}
                label={label}
                hint={field.placeholder ?? undefined}
                name={name}
                type={inputType(field.fieldType)}
                inputMode={field.fieldType === "number" ? "numeric" : undefined}
                dir={LTR_FIELD_TYPES.includes(field.fieldType) ? "ltr" : undefined}
                required={field.isRequired}
                maxLength={200}
                autoComplete="off"
              />
            );
          })}
        </div>
      ) : null}

      <FormResult error={error} />

      <div>
        <Button
          type="submit"
          size="lg"
          fullWidth
          disabled={disabled || pending}
          aria-disabled={disabled || pending}
        >
          {submitLabel}
        </Button>
      </div>
      </form>

      {/*
        * Thumb-reachable pay bar on a phone. The summary rail stacks *below*
        * the form on mobile, so the total would otherwise sit under the pay
        * button and the pay button would scroll away while the customer works
        * the fields. Portaled out of the page wrapper — see the note above —
        * and submitted through `form`, so it is the same checkout, not a copy
        * of it. Total stays a server quote; nothing is computed here.
        */}
      {mounted
        ? createPortal(
            <div
              className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--canvas-raised)_94%,transparent)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--elevation-2)] backdrop-blur-xl lg:hidden print:hidden"
            >
              <div className="flex items-center gap-4 px-[var(--page-gutter)]">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--ink-faint)]">
                    {messages.summary.totalLabel}
                  </p>
                  <p className="text-base font-semibold text-[var(--ink)] tabular-nums" dir="ltr">
                    {formatPrice(total, currency, locale)}
                  </p>
                  {balanceAfter !== null && !disabled ? (
                    <p className="text-xs text-[var(--ink-muted)] tabular-nums" dir="ltr">
                      {messages.summary.balanceAfterLabel}: {formatPrice(balanceAfter, currency, locale)}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  form={CHECKOUT_FORM_ID}
                  className="ms-auto"
                  size="md"
                  disabled={disabled || pending}
                  aria-disabled={disabled || pending}
                >
                  {submitLabel}
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
