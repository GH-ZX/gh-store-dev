"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { ForbiddenError, requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import {
  approveRecharge,
  RechargeForbiddenError,
  RechargeNotFoundError,
  RechargeSettledError,
  rejectRecharge,
  saveRechargeSettings,
} from "@/lib/services/admin-recharge.service";
import type { AdminRechargeState } from "@/app/[locale]/dashboard/recharges/action-state";

const reviewSchema = z.object({
  requestId: z.uuid(),
  // Empty means "credit what was requested", so it stays optional rather than
  // defaulting to zero.
  creditAmount: z.coerce.number().positive().max(100_000).optional(),
  note: z.string().trim().max(280).optional(),
  locale: z.string().optional(),
});

const settingsSchema = z.object({
  minAmount: z.coerce.number().positive().max(100_000),
  maxAmount: z.coerce.number().positive().max(100_000),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

function refresh(locale: Locale): void {
  revalidatePath(`/${locale}/dashboard/recharges`);
  // A credit changes a balance the storefront chrome shows.
  revalidatePath("/", "layout");
}

function reviewError(error: unknown): AdminRechargeState {
  if (error instanceof RechargeSettledError) {
    return { error: "already_settled", notice: null };
  }

  if (error instanceof RechargeNotFoundError) {
    return { error: "not_found", notice: null };
  }

  if (error instanceof RechargeForbiddenError || error instanceof ForbiddenError) {
    return { error: "forbidden", notice: null };
  }

  return { error: "unknown", notice: null };
}

export async function approveRechargeAction(
  _state: AdminRechargeState,
  formData: FormData,
): Promise<AdminRechargeState> {
  await requireAdmin();

  const parsed = reviewSchema.safeParse({
    requestId: formText(formData, "requestId"),
    creditAmount: formText(formData, "creditAmount"),
    note: formText(formData, "note"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  try {
    await approveRecharge({
      requestId: parsed.data.requestId,
      creditAmount: parsed.data.creditAmount ?? null,
      note: parsed.data.note ?? null,
    });
  } catch (error) {
    return reviewError(error);
  }

  refresh(resolveLocale(parsed.data.locale));

  return { error: null, notice: "approved" };
}

export async function rejectRechargeAction(
  _state: AdminRechargeState,
  formData: FormData,
): Promise<AdminRechargeState> {
  await requireAdmin();

  const parsed = reviewSchema.safeParse({
    requestId: formText(formData, "requestId"),
    note: formText(formData, "note"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  try {
    await rejectRecharge({ requestId: parsed.data.requestId, note: parsed.data.note ?? null });
  } catch (error) {
    return reviewError(error);
  }

  refresh(resolveLocale(parsed.data.locale));

  return { error: null, notice: "rejected" };
}

export async function saveRechargeSettingsAction(
  _state: AdminRechargeState,
  formData: FormData,
): Promise<AdminRechargeState> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse({
    minAmount: formText(formData, "minAmount"),
    maxAmount: formText(formData, "maxAmount"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { error: "invalid_input", notice: null };
  }

  if (parsed.data.maxAmount < parsed.data.minAmount) {
    return { error: "invalid_input", notice: null };
  }

  try {
    await saveRechargeSettings({
      minAmount: parsed.data.minAmount,
      maxAmount: parsed.data.maxAmount,
    });
  } catch {
    return { error: "unknown", notice: null };
  }

  refresh(resolveLocale(parsed.data.locale));

  return { error: null, notice: "auto_saved" };
}
