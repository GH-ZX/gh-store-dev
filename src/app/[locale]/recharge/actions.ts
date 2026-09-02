"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@/lib/forms/form-data";
import {
  syncMyBinanceInvoice,
  startBinanceTopUp,
} from "@/lib/services/binance-recharge.service";
import { markRechargePaid, submitRechargeRequest } from "@/lib/services/recharge.service";
import type {
  BinanceTopUpState,
  RechargeActionState,
} from "@/app/[locale]/recharge/action-state";

const submitSchema = z.object({
  amount: z.coerce.number().positive().max(100_000),
  method: z.string().trim().min(1).max(40),
  locale: z.string().optional(),
});

const paidSchema = z.object({
  requestId: z.uuid(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function submitRechargeAction(
  _state: RechargeActionState,
  formData: FormData,
): Promise<RechargeActionState> {
  const parsed = submitSchema.safeParse({
    amount: formText(formData, "amount"),
    method: formText(formData, "method"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null, reference: null, requestId: null, credited: false };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await submitRechargeRequest({
    amount: parsed.data.amount,
    method: parsed.data.method,
  });

  if (!result.ok) {
    return { error: result.reason, notice: null, reference: null, requestId: null, credited: false };
  }

  revalidatePath(`/${locale}/recharge`);
  // A credited request changes the balance shown in the header and the wallet.
  revalidatePath("/", "layout");

  return {
    error: null,
    notice: "submitted",
    reference: result.reference,
    requestId: result.requestId,
    credited: result.credited,
  };
}

export async function markPaidAction(
  _state: RechargeActionState,
  formData: FormData,
): Promise<RechargeActionState> {
  const parsed = paidSchema.safeParse({
    requestId: formText(formData, "requestId"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null, reference: null, requestId: null, credited: false };
  }

  const done = await markRechargePaid(parsed.data.requestId);

  if (!done) {
    return { error: "not_found", notice: null, reference: null, requestId: null, credited: false };
  }

  revalidatePath(`/${resolveLocale(parsed.data.locale)}/recharge`);

  return { error: null, notice: "marked_paid", reference: null, requestId: null, credited: false };
}

/**
 * Open a Binance Pay invoice and hand back where to pay it.
 *
 * The URL is returned rather than redirected to, because it leaves the store
 * entirely: a server redirect to a third party makes the back button ambiguous
 * and hides which step failed when one does.
 */
const binanceSchema = z.object({
  amount: z.coerce.number().positive().max(100000),
  locale: z.string().optional(),
});

export async function startBinanceTopUpAction(
  _state: BinanceTopUpState,
  formData: FormData,
): Promise<BinanceTopUpState> {
  const parsed = binanceSchema.safeParse({
    amount: formText(formData, "amount"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", checkoutUrl: null, invoiceId: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await startBinanceTopUp({ amount: parsed.data.amount, locale });

  if (!result.ok) {
    return { error: result.reason, checkoutUrl: null, invoiceId: null };
  }

  // The request exists now, so the customer's own recharge history is stale.
  revalidatePath(`/${locale}/recharge`);

  return { error: null, checkoutUrl: result.checkoutUrl, invoiceId: result.invoiceId };
}

const checkBinanceSchema = z.object({
  invoiceId: z.string().trim().min(1).max(120),
  locale: z.string().optional(),
});

/**
 * Ask Binance how this customer's invoice turned out.
 *
 * The payment screen's poll and its button share this one path. Ownership is
 * established inside the service before anything is asked of Binance, so an
 * invoice id from somewhere else reads back as not found rather than settling
 * somebody else's payment in front of them.
 */
export async function checkBinanceInvoiceAction(
  _state: BinanceTopUpState,
  formData: FormData,
): Promise<BinanceTopUpState> {
  const parsed = checkBinanceSchema.safeParse({
    invoiceId: formText(formData, "invoiceId"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", checkoutUrl: null, invoiceId: null };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await syncMyBinanceInvoice(parsed.data.invoiceId);

  if (!result.ok) {
    return {
      error: result.reason === "not_found" ? "not_found" : "unknown",
      checkoutUrl: null,
      invoiceId: null,
    };
  }

  if (result.credited) {
    // The balance appears in the header and on the wallet page.
    revalidatePath("/", "layout");
    revalidatePath(`/${locale}/wallet`);
  }

  revalidatePath(`/${locale}/recharge/pay/${encodeURIComponent(parsed.data.invoiceId)}`);

  return { error: null, checkoutUrl: null, invoiceId: null, status: result.status };
}
