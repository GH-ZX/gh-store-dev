"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  INITIAL_SUPPORT_QUEUE_STATE,
  type SupportQueueActionState,
} from "@/app/[locale]/dashboard/support/action-state";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { requireAdmin } from "@/lib/auth/guards";
import { formText } from "@/lib/forms/form-data";
import { recordAudit } from "@/lib/services/admin-audit.service";
import { notify } from "@/lib/services/notification.service";
import {
  getSupportConversation,
  replyAsAdmin,
  setThreadStatus,
} from "@/lib/services/support.service";
import { isSupportStatus, SUPPORT_STATUSES } from "@/lib/support/status";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * Answering and closing support requests.
 *
 * Both actions are admin-only twice over: the service checks, and the dashboard
 * layout that renders them already refused anyone else. The audit row is the
 * part that matters here — an answer sent to a customer and a ticket closed are
 * both things somebody may later need to attribute.
 */

const replySchema = z.object({
  locale: z.string().optional(),
  threadId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
});

const statusSchema = z.object({
  locale: z.string().optional(),
  threadId: z.uuid(),
  status: z.enum(SUPPORT_STATUSES),
});

function resolveLocale(value: string | undefined): Locale {
  return value && isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Who raised a thread, read with service authority.
 *
 * Needed only to address the notification. The admin's own session could read
 * the thread through the admin policy, but the customer's id is not on the row
 * the queue already fetched, and asking for it separately keeps the reply path
 * from depending on what the page happened to load.
 */
async function threadOwner(threadId: string): Promise<string | null> {
  if (!hasServiceRoleKey()) {
    return null;
  }

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("support_threads")
    .select("user_id")
    .eq("id", threadId)
    .maybeSingle();

  return data?.user_id ?? null;
}

export async function replyAction(
  _state: SupportQueueActionState,
  formData: FormData,
): Promise<SupportQueueActionState> {
  const admin = await requireAdmin();
  const parsed = replySchema.safeParse({
    locale: formText(formData, "locale"),
    threadId: formText(formData, "threadId"),
    body: formText(formData, "body"),
  });

  if (!parsed.success) {
    return { ...INITIAL_SUPPORT_QUEUE_STATE, error: "invalid_input" };
  }

  const result = await replyAsAdmin({
    threadId: parsed.data.threadId,
    body: parsed.data.body,
  });

  if (!result.ok) {
    return { ...INITIAL_SUPPORT_QUEUE_STATE, error: result.reason };
  }

  const locale = resolveLocale(parsed.data.locale);

  await recordAudit({
    actorId: admin.id,
    action: "support.reply",
    entityType: "support_thread",
    entityId: parsed.data.threadId,
    // The reply text is not recorded: it is already the thread, and copying it
    // into the audit log would put the same words in two places to be kept.
    values: { length: parsed.data.body.length },
  });

  /*
   * Tell the customer. A reply nobody sees is the same as no reply — most people
   * will not have the support page open when the answer arrives.
   */
  const userId = await threadOwner(parsed.data.threadId);

  if (userId) {
    await notify({
      userId,
      type: "support_reply",
      titleAr: "وصلك رد على طلب الدعم",
      titleEn: "We replied to your request",
      bodyAr: "افتح صفحة الدعم لقراءة الرد.",
      bodyEn: "Open the support page to read our reply.",
      href: `/${locale}/support?thread=${parsed.data.threadId}`,
      entityType: "support_thread",
      entityId: parsed.data.threadId,
    });
  }

  revalidatePath(`/${locale}/dashboard/support`);

  return { error: null, notice: "sent" };
}

export async function setStatusAction(
  _state: SupportQueueActionState,
  formData: FormData,
): Promise<SupportQueueActionState> {
  const admin = await requireAdmin();
  const parsed = statusSchema.safeParse({
    locale: formText(formData, "locale"),
    threadId: formText(formData, "threadId"),
    status: formText(formData, "status"),
  });

  if (!parsed.success || !isSupportStatus(parsed.data.status)) {
    return { ...INITIAL_SUPPORT_QUEUE_STATE, error: "invalid_input" };
  }

  // Read the old status first, so the audit row says what changed rather than
  // only what it became.
  const before = await getSupportConversation(parsed.data.threadId);
  const result = await setThreadStatus({
    threadId: parsed.data.threadId,
    status: parsed.data.status,
  });

  if (!result.ok) {
    return { ...INITIAL_SUPPORT_QUEUE_STATE, error: result.reason };
  }

  await recordAudit({
    actorId: admin.id,
    action: "support.set_status",
    entityType: "support_thread",
    entityId: parsed.data.threadId,
    values: {
      from: before.ok ? before.thread.status : null,
      to: parsed.data.status,
    },
  });

  revalidatePath(`/${resolveLocale(parsed.data.locale)}/dashboard/support`);

  return { error: null, notice: "status_set" };
}
