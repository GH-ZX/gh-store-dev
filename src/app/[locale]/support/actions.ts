"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INITIAL_SUPPORT_STATE, type SupportActionState } from "@/app/[locale]/support/action-state";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { formText } from "@/lib/forms/form-data";
import { openSupportThread, replyToThread } from "@/lib/services/support.service";

/**
 * Raising and continuing a support thread.
 *
 * Both actions do only shape checking. Whether the caller may write to this
 * thread at all is the database's decision — `support_messages` has an insert
 * policy that ties a message to a thread the caller owns and pins `sender_role`
 * to 'customer' — so there is nothing useful to re-check here, and a second copy
 * of that rule would only be somewhere for the two to disagree.
 */

const openSchema = z.object({
  locale: z.string().optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
});

const replySchema = z.object({
  locale: z.string().optional(),
  threadId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function openThreadAction(
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const parsed = openSchema.safeParse({
    locale: formText(formData, "locale"),
    subject: formText(formData, "subject"),
    body: formText(formData, "body"),
  });

  if (!parsed.success) {
    return { ...INITIAL_SUPPORT_STATE, error: "invalid_input" };
  }

  const result = await openSupportThread({
    subject: parsed.data.subject,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return { ...INITIAL_SUPPORT_STATE, error: result.reason };
  }

  revalidatePath(`/${resolveLocale(parsed.data.locale)}/support`);

  return { error: null, notice: "opened" };
}

export async function replyAction(
  _state: SupportActionState,
  formData: FormData,
): Promise<SupportActionState> {
  const parsed = replySchema.safeParse({
    locale: formText(formData, "locale"),
    threadId: formText(formData, "threadId"),
    body: formText(formData, "body"),
  });

  if (!parsed.success) {
    return { ...INITIAL_SUPPORT_STATE, error: "invalid_input" };
  }

  const result = await replyToThread({
    threadId: parsed.data.threadId,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return { ...INITIAL_SUPPORT_STATE, error: result.reason };
  }

  revalidatePath(`/${resolveLocale(parsed.data.locale)}/support`);

  return { error: null, notice: "sent" };
}
