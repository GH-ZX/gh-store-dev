"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { checkoutFieldName, type CheckoutActionState } from "@/app/[locale]/checkout/action-state";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@/lib/forms/form-data";
import { getOfferBySlug, type StoreInputField } from "@/lib/services/catalog.service";
import { placeOrder, type PlaceOrderResult } from "@/lib/services/order.service";

/**
 * Placing an order from the checkout form.
 *
 * Nothing about the product is taken from the browser except the two public
 * slugs. The offer — and with it the price and the exact set of account fields
 * the supplier requires — is re-read on the server, so a crafted form can neither
 * negotiate a total nor invent a field that was never asked for.
 *
 * Money is not computed here either. `placeOrder` re-reads the price inside the
 * database transaction that debits the wallet; this action only decides whether
 * the submission is well-formed enough to attempt.
 */

type PlaceOrderReason = Extract<PlaceOrderResult, { ok: false }>["reason"];

/**
 * Reasons map to keys in the checkout namespace's `errors` block. Spelled out
 * rather than passed through, so renaming a message key breaks the build instead
 * of rendering the key itself to a customer.
 */
const REASON_MESSAGE_KEYS: Record<PlaceOrderReason, string> = {
  unauthenticated: "unauthenticated",
  suspended: "suspended",
  unavailable: "unavailable",
  insufficient_balance: "insufficient_balance",
  in_progress: "in_progress",
  invalid_fields: "invalid_fields",
  unknown: "unknown",
};

const SLUG_MAX = 160;
const FIELD_VALUE_MAX = 200;
const NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

const checkoutSchema = z.object({
  locale: z.string().optional(),
  gameSlug: z.string().trim().min(1).max(SLUG_MAX),
  offerSlug: z.string().trim().min(1).max(SLUG_MAX),
  quantity: z.coerce.number().int().min(1).max(10),
  idempotencyKey: z.uuid(),
});

/** Output is the trimmed value, or undefined for an omitted optional field. */
type FieldSchema = z.ZodType<string | undefined>;

/**
 * One schema per account field, derived from the offer.
 *
 * A `select` is checked against its own options, so a hand-edited form cannot
 * submit a server or region the game does not offer. `number` and `email` are
 * checked for shape because the supplier rejects the order rather than the field,
 * and a rejection there costs a refund cycle.
 */
function fieldSchema(field: StoreInputField): FieldSchema {
  if (field.options.length > 0) {
    const options = z.enum(field.options.map((option) => option.value));

    return field.isRequired ? options : options.optional();
  }

  if (field.fieldType === "email") {
    const email = z.string().max(FIELD_VALUE_MAX).pipe(z.email());

    return field.isRequired ? email : email.optional();
  }

  if (field.fieldType === "number") {
    const numeric = z.string().min(1).max(32).regex(NUMERIC_PATTERN);

    return field.isRequired ? numeric : numeric.optional();
  }

  const text = z.string().min(1).max(FIELD_VALUE_MAX);

  return field.isRequired ? text : text.optional();
}

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function placeOrderAction(
  _state: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const parsed = checkoutSchema.safeParse({
    locale: formText(formData, "locale"),
    gameSlug: formText(formData, "gameSlug"),
    offerSlug: formText(formData, "offerSlug"),
    quantity: formText(formData, "quantity") ?? "1",
    idempotencyKey: formText(formData, "idempotencyKey"),
  });

  if (!parsed.success) {
    return { error: "invalid_fields" };
  }

  const locale = resolveLocale(parsed.data.locale);
  const detail = await getOfferBySlug(locale, parsed.data.gameSlug, parsed.data.offerSlug);

  if (!detail) {
    return { error: "unavailable" };
  }

  /*
   * The field list comes from the offer, never from the submission. Values are
   * trimmed to undefined first: a required field holding only spaces is missing,
   * and an optional one holding only spaces was left blank.
   */
  const shape: Record<string, FieldSchema> = {};
  const submitted: Record<string, string | undefined> = {};

  for (const field of detail.inputFields) {
    const raw = formText(formData, checkoutFieldName(field.fieldKey))?.trim();
    shape[field.fieldKey] = fieldSchema(field);
    submitted[field.fieldKey] = raw && raw.length > 0 ? raw : undefined;
  }

  const parsedFields = z.object(shape).safeParse(submitted);

  if (!parsedFields.success) {
    return { error: "invalid_fields" };
  }

  const dynamicFields: Record<string, string> = {};

  for (const field of detail.inputFields) {
    const value = parsedFields.data[field.fieldKey];

    if (typeof value === "string" && value.length > 0) {
      dynamicFields[field.fieldKey] = value;
    }
  }

  const result = await placeOrder({
    offerSlug: parsed.data.offerSlug,
    gameSlug: parsed.data.gameSlug,
    quantity: parsed.data.quantity,
    dynamicFields,
    idempotencyKey: parsed.data.idempotencyKey,
  });

  if (!result.ok) {
    return { error: REASON_MESSAGE_KEYS[result.reason] };
  }

  // Outside any try/catch: `redirect` works by throwing.
  redirect(`/${locale}/orders/${result.orderId}`);
}
