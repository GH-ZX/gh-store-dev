"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@/lib/forms/form-data";
import { markRechargePaid, submitRechargeRequest } from "@/lib/services/recharge.service";
import type { RechargeActionState } from "@/app/[locale]/recharge/action-state";

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
    return { error: "invalid_input", notice: null, reference: null, credited: false };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await submitRechargeRequest({
    amount: parsed.data.amount,
    method: parsed.data.method,
  });

  if (!result.ok) {
    return { error: result.reason, notice: null, reference: null, credited: false };
  }

  revalidatePath(`/${locale}/recharge`);
  // A credited request changes the balance shown in the header and the wallet.
  revalidatePath("/", "layout");

  return {
    error: null,
    notice: "submitted",
    reference: result.reference,
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
    return { error: "invalid_input", notice: null, reference: null, credited: false };
  }

  const done = await markRechargePaid(parsed.data.requestId);

  if (!done) {
    return { error: "not_found", notice: null, reference: null, credited: false };
  }

  revalidatePath(`/${resolveLocale(parsed.data.locale)}/recharge`);

  return { error: null, notice: "marked_paid", reference: null, credited: false };
}
