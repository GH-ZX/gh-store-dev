"use client";

import { useActionState, useMemo } from "react";
import {
  checkoutFieldName,
  INITIAL_CHECKOUT_STATE,
  type CheckoutActionState,
} from "@/app/[locale]/checkout/action-state";
import { placeOrderAction } from "@/app/[locale]/checkout/actions";
import { FormResult, SelectField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { CheckoutMessages } from "@/i18n/messages";
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
};

type ErrorKey = keyof CheckoutMessages["errors"];

/** Only genuinely Latin values get an explicit direction. */
const LTR_FIELD_TYPES: StoreInputField["fieldType"][] = ["number", "email", "uid"];

function inputType(fieldType: StoreInputField["fieldType"]): string {
  if (fieldType === "number") {
    return "number";
  }

  return fieldType === "email" ? "email" : "text";
}

export function CheckoutForm({
  locale,
  messages,
  gameSlug,
  offerSlug,
  fields,
  disabled,
}: CheckoutFormProps) {
  const [state, formAction, pending] = useActionState<CheckoutActionState, FormData>(
    placeOrderAction,
    INITIAL_CHECKOUT_STATE,
  );

  // Tied to this mount, not to each submit, so a retry of the same intent stays
  // the same operation.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const error = state.error
    ? (messages.errors[state.error as ErrorKey] ?? messages.errors.unknown)
    : null;

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="gameSlug" value={gameSlug} />
      <input type="hidden" name="offerSlug" value={offerSlug} />
      <input type="hidden" name="quantity" value="1" />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

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
          {pending ? messages.fields.submitPending : messages.fields.submitAction}
        </Button>
      </div>
    </form>
  );
}
