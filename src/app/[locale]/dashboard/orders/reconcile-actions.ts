"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import { reconcileStuckOrders } from "@/lib/services/reconciliation.service";
import {
  INITIAL_RECONCILE_STATE,
  type ReconcileState,
} from "@/app/[locale]/dashboard/orders/reconcile-action-state";

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Run the sweep now, by hand.
 *
 * The scheduler is the normal path, but it only exists once the store runs on a
 * public address. This is what makes the same work available while developing,
 * and it gives an operator a way to act on a stuck order without waiting for the
 * next tick.
 */
export async function runReconciliationAction(
  _state: ReconcileState,
  formData: FormData,
): Promise<ReconcileState> {
  await requireAdmin();

  const locale = resolveLocale(formText(formData, "locale"));

  try {
    const run = await reconcileStuckOrders();

    revalidatePath(`/${locale}/dashboard/orders`);
    // A settled order changes what the customer sees too.
    revalidatePath("/", "layout");

    return {
      error: null,
      notice: "ran",
      summary: {
        checked: run.checked,
        completed: run.completed,
        refunded: run.refunded,
        escalated: run.escalated,
      },
    };
  } catch {
    return { ...INITIAL_RECONCILE_STATE, error: "unknown" };
  }
}
