"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import {
  AdminChangeRefusedError,
  CustomerNotFoundError,
  setCustomerActive,
  setCustomerRole,
} from "@/lib/services/admin-customers.service";
import {
  INITIAL_ACCESS_STATE,
  type AccessState,
} from "@/app/[locale]/dashboard/customers/access-action-state";

const schema = z.object({
  userId: z.uuid(),
  value: z.string(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

function toError(error: unknown): AccessState {
  if (error instanceof AdminChangeRefusedError) {
    return { ...INITIAL_ACCESS_STATE, error: error.reason };
  }

  if (error instanceof CustomerNotFoundError) {
    return { ...INITIAL_ACCESS_STATE, error: "not_found" };
  }

  return { ...INITIAL_ACCESS_STATE, error: "unknown" };
}

function refresh(locale: Locale, userId: string): void {
  revalidatePath(`/${locale}/dashboard/customers`);
  revalidatePath(`/${locale}/dashboard/customers/${userId}`);
  // Access decides what the header offers, so every render is affected.
  revalidatePath("/", "layout");
}

export async function setRoleAction(_state: AccessState, formData: FormData): Promise<AccessState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    userId: formText(formData, "userId"),
    value: formText(formData, "role"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_ACCESS_STATE, error: "invalid_input" };
  }

  try {
    await setCustomerRole(parsed.data.userId, parsed.data.value);
    refresh(resolveLocale(parsed.data.locale), parsed.data.userId);

    return { error: null, notice: parsed.data.value === "admin" ? "promoted" : "demoted" };
  } catch (error) {
    return toError(error);
  }
}

export async function setActiveAction(
  _state: AccessState,
  formData: FormData,
): Promise<AccessState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    userId: formText(formData, "userId"),
    value: formText(formData, "active"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_ACCESS_STATE, error: "invalid_input" };
  }

  const nextActive = parsed.data.value === "true";

  try {
    await setCustomerActive(parsed.data.userId, nextActive);
    refresh(resolveLocale(parsed.data.locale), parsed.data.userId);

    return { error: null, notice: nextActive ? "reactivated" : "suspended" };
  } catch (error) {
    return toError(error);
  }
}
