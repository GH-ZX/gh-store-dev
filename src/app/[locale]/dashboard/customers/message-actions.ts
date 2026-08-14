"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import { sendCustomerMessage } from "@/lib/services/admin-customers.service";
import {
  INITIAL_MESSAGE_STATE,
  type MessageState,
} from "@/app/[locale]/dashboard/customers/message-action-state";

/**
 * Send one customer a message from the store.
 *
 * Its own module rather than another export of `actions.ts`, following the
 * access changes next to it: each of these forms posts to exactly one action,
 * and a stray Enter in one must not submit another.
 */
const messageSchema = z.object({
  userId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1000),
  locale: z.string().optional(),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function sendCustomerMessageAction(
  _state: MessageState,
  formData: FormData,
): Promise<MessageState> {
  await requireAdmin();

  const parsed = messageSchema.safeParse({
    userId: formText(formData, "userId"),
    title: formText(formData, "title"),
    body: formText(formData, "body"),
    locale: formText(formData, "locale"),
  });

  if (!parsed.success) {
    return { ...INITIAL_MESSAGE_STATE, error: "invalid_input" };
  }

  const locale = resolveLocale(parsed.data.locale);
  const result = await sendCustomerMessage({
    userId: parsed.data.userId,
    title: parsed.data.title,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return { ...INITIAL_MESSAGE_STATE, error: result.reason };
  }

  // The recipient's own notification list and header count are stale everywhere.
  revalidatePath("/", "layout");
  revalidatePath(`/${locale}/dashboard/customers/${parsed.data.userId}`);

  return { ...INITIAL_MESSAGE_STATE, notice: "sent" };
}
