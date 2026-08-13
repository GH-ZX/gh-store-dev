"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { ForbiddenError, requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import {
  adjustCustomerBalance,
  AdjustmentForbiddenError,
  CustomerNotFoundError,
  NegativeBalanceError,
} from "@/lib/services/admin-customers.service";
import type { CustomerActionState } from "@/app/[locale]/dashboard/customers/action-state";

/**
 * Balance adjustment.
 *
 * The bound is deliberate: a mistyped amount should be rejected here rather than
 * become a five-figure credit. A reason is required, because an unexplained
 * balance change is impossible to audit later.
 */
const MAX_ADJUSTMENT = 100_000;

const adjustSchema = z.object({
  userId: z.uuid(),
  amount: z.coerce
    .number()
    .refine((value) => value !== 0, "The amount must not be zero")
    .refine((value) => Math.abs(value) <= MAX_ADJUSTMENT, "The amount is out of range"),
  description: z.string().trim().min(3).max(280),
  idempotencyKey: z.uuid(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function adjustBalanceAction(
  _state: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  await requireAdmin();

  const parsed = adjustSchema.safeParse({
    userId: formText(formData, "userId"),
    amount: formText(formData, "amount"),
    description: formText(formData, "description"),
    idempotencyKey: formText(formData, "idempotencyKey"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  const locale = resolveLocale(parsed.data.locale);

  try {
    await adjustCustomerBalance({
      userId: parsed.data.userId,
      amount: parsed.data.amount,
      description: parsed.data.description,
      idempotencyKey: parsed.data.idempotencyKey,
    });
  } catch (error) {
    if (error instanceof NegativeBalanceError) {
      return { error: "negative_balance", notice: null };
    }

    if (error instanceof CustomerNotFoundError) {
      return { error: "not_found", notice: null };
    }

    if (error instanceof AdjustmentForbiddenError || error instanceof ForbiddenError) {
      return { error: "forbidden", notice: null };
    }

    return { error: "unknown", notice: null };
  }

  revalidatePath(`/${locale}/dashboard/customers`);
  revalidatePath(`/${locale}/dashboard/customers/${parsed.data.userId}`);
  // The customer's own wallet page must not keep showing the old balance.
  revalidatePath("/", "layout");

  return { error: null, notice: "adjusted" };
}
