"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@/lib/forms/form-data";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/services/notification.service";
import {
  INITIAL_NOTIFICATION_STATE,
  type NotificationActionState,
} from "@/app/[locale]/notifications/action-state";

const readSchema = z.object({
  id: z.uuid().optional(),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The unread count lives in the header, so the whole shell has to refresh. */
function refresh(locale: Locale): void {
  revalidatePath(`/${locale}/notifications`);
  revalidatePath("/", "layout");
}

export async function markAllReadAction(
  _state: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = readSchema.safeParse({ locale: formText(formData, "locale") });
  const locale = resolveLocale(parsed.success ? parsed.data.locale : undefined);

  if (!(await markAllNotificationsRead())) {
    return { ...INITIAL_NOTIFICATION_STATE, error: "unknown" };
  }

  refresh(locale);

  return { ...INITIAL_NOTIFICATION_STATE, notice: "all_read" };
}

export async function markReadAction(
  _state: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const parsed = readSchema.safeParse({
    id: formText(formData, "id"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success || !parsed.data.id) {
    return { ...INITIAL_NOTIFICATION_STATE, error: "invalid_input" };
  }

  if (!(await markNotificationRead(parsed.data.id))) {
    return { ...INITIAL_NOTIFICATION_STATE, error: "unknown" };
  }

  refresh(resolveLocale(parsed.data.locale));

  return { ...INITIAL_NOTIFICATION_STATE, notice: "marked" };
}
