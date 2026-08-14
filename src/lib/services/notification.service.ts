import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import type { Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import { logFailure } from "@/lib/logging/logger";

/**
 * Customer notifications.
 *
 * Writing and reading are deliberately asymmetric. A customer reads and marks
 * their own — their session is the gate, through RLS. Writing goes through the
 * service client, because a notification is the store telling the customer
 * something, and a customer must not be able to invent one for themselves or for
 * anybody else.
 *
 * The one rule that matters here: **notifying must never break the thing it
 * reports on.** A failed insert cannot be allowed to turn a successful delivery
 * into a failed order, so {@link notify} swallows its errors and returns whether
 * it worked. Callers on the money path ignore the result.
 */

export type NotificationType =
  | "order_delivered"
  | "order_failed"
  | "recharge_approved"
  | "recharge_rejected";

export type CustomerNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  /** Where the notification leads; locale-prefixed by the caller. */
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
};

export async function notify(input: NotifyInput): Promise<boolean> {
  if (!hasServiceRoleKey()) {
    return false;
  }

  try {
    const service = createSupabaseServiceClient();
    const { error } = await service.from("notifications").insert({
      user_id: input.userId,
      notification_type: input.type,
      title_ar: input.titleAr,
      title_en: input.titleEn,
      body_ar: input.bodyAr,
      body_en: input.bodyEn,
      href: input.href ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
    });

    if (error) {
      logFailure("notifications", "insert_failed", error, {
        userId: input.userId,
        type: input.type,
      });
    }

    return !error;
  } catch (error) {
    logFailure("notifications", "insert_threw", error, { userId: input.userId, type: input.type });
    // Never rethrow: see the note above about not breaking the money path.
    return false;
  }
}

export async function getMyNotifications(locale: Locale, limit = 50): Promise<CustomerNotification[]> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, notification_type, title_ar, title_en, body_ar, body_en, href, is_read, created_at")
    .eq("user_id", user.id)
    .eq("is_visible", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.notification_type,
    title: locale === "ar" ? row.title_ar : row.title_en,
    body: locale === "ar" ? row.body_ar : row.body_en,
    href: row.href,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));
}

/**
 * How many unread, for the header badge.
 *
 * Returns 0 rather than throwing when nobody is signed in, because the header
 * renders on every page including public ones.
 */
export async function getUnreadNotificationCount(userId: string | null): Promise<number> {
  if (!userId) {
    return 0;
  }

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_visible", true)
    .eq("is_read", false);

  return count ?? 0;
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return !error;
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();
  // Scoped by user as well as id: the RLS policy already does this, and saying it
  // here means a policy change cannot silently widen the statement.
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", user.id);

  return !error;
}
