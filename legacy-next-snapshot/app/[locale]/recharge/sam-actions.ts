"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@/lib/forms/form-data";
import {
  startSamTopUp,
  syncSamInvoice,
  verifySamPayment,
  type SettleResult,
} from "@/lib/services/sam-recharge.service";
import { INITIAL_SAM_TOPUP_STATE, type SamTopUpState } from "@/app/[locale]/recharge/sam-action-state";

/**
 * Customer actions for a Sam API top-up.
 *
 * None of these can credit anything by themselves — each one asks the service,
 * which asks Sam, and only a payment Sam confirms reaches the wallet.
 */

const startSchema = z.object({
  amount: z.coerce.number().positive().max(100_000),
  method: z.enum(["shamcash", "syriatel"]),
  locale: z.string().optional(),
});

const invoiceSchema = z.object({
  samInvoiceId: z.string().trim().min(1).max(120),
  locale: z.string().optional(),
});

const verifySchema = invoiceSchema.extend({
  // A wallet transaction reference, as printed in the customer's payment app.
  transactionRef: z.string().trim().min(2).max(120),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Turn a settle outcome into form state, keeping wording out of the service. */
function toState(result: SettleResult, locale: Locale): SamTopUpState {
  if (result.ok) {
    if (result.status === "credited") {
      // The balance appears in the header and on the wallet page.
      revalidatePath("/", "layout");
      revalidatePath(`/${locale}/wallet`);

      return { error: null, notice: "credited", detail: null, status: "credited" };
    }

    if (result.status === "awaiting_review") {
      revalidatePath(`/${locale}/recharge`);

      return { error: null, notice: "awaiting_review", detail: null, status: "awaiting_review" };
    }

    return { error: null, notice: "still_pending", detail: null, status: "pending" };
  }

  return {
    error: result.reason,
    notice: null,
    detail: result.message ?? null,
    status: result.reason === "expired" ? "expired" : "pending",
  };
}

/**
 * Open an invoice and send the customer to the payment screen.
 *
 * A redirect rather than a rendered result: the invoice lives 15 minutes and has
 * its own page, so it survives a refresh and can be returned to.
 */
export async function startSamTopUpAction(
  _state: SamTopUpState,
  formData: FormData,
): Promise<SamTopUpState> {
  const parsed = startSchema.safeParse({
    amount: formText(formData, "amount"),
    method: formText(formData, "method"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_SAM_TOPUP_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await startSamTopUp({ amount: parsed.data.amount, method: parsed.data.method });

  if (!result.ok) {
    return { ...INITIAL_SAM_TOPUP_STATE, error: result.reason };
  }

  revalidatePath(`/${locale}/recharge`);
  redirect(`/${locale}/recharge/pay/${encodeURIComponent(result.invoice.samInvoiceId)}`);
}

/** Ask Sam whether the transfer has landed yet. */
export async function checkSamInvoiceAction(
  _state: SamTopUpState,
  formData: FormData,
): Promise<SamTopUpState> {
  const parsed = invoiceSchema.safeParse({
    samInvoiceId: formText(formData, "samInvoiceId"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_SAM_TOPUP_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await syncSamInvoice(parsed.data.samInvoiceId);
  revalidatePath(`/${locale}/recharge/pay/${parsed.data.samInvoiceId}`);

  return toState(result, locale);
}

/** Match a wallet transaction reference against the invoice. */
export async function verifySamPaymentAction(
  _state: SamTopUpState,
  formData: FormData,
): Promise<SamTopUpState> {
  const parsed = verifySchema.safeParse({
    samInvoiceId: formText(formData, "samInvoiceId"),
    transactionRef: formText(formData, "transactionRef"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_SAM_TOPUP_STATE, error: "invalid_reference" };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await verifySamPayment({
    samInvoiceId: parsed.data.samInvoiceId,
    transactionRef: parsed.data.transactionRef,
  });
  revalidatePath(`/${locale}/recharge/pay/${parsed.data.samInvoiceId}`);

  return toState(result, locale);
}
