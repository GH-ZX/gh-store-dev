import "server-only";

import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import { logFailure } from "@/lib/logging/logger";
import { notifyAdmins, type AdminNotificationType, type NotifyInput } from "@/lib/services/notification.service";
import type { Json } from "@/types/database";

/**
 * Alerts delivered over Telegram.
 *
 * The Cloudflare Worker delivers these on its schedule; this module only writes
 * the queue. Same rule as customer notifications: alerting must never break the
 * thing it reports on, so {@link enqueueTelegramAlert} swallows every failure
 * and the money path never waits on Telegram.
 *
 * `userId` routes the alert to a linked customer's chat (looked up by the
 * Worker); when omitted the alert goes to the owner's chat, as before. Owner
 * and customer alerts share the same queue and types — `order_failed` already
 * carries the refund state both audiences want — so there is exactly one drain
 * and one retry loop.
 *
 * `dedupKey` is optional and deliberately rare — it exists for events that fire
 * repeatedly (a low wallet blocking every checkout) where a unique key makes
 * the insert a no-op instead of a flood.
 *
 * Most types here are written from the app, but the Worker also inserts into
 * the same queue — `sweep_stalled` is written by `worker/telegram-bot.ts`,
 * which watches the sweep from outside the app — so this union and the
 * Worker's rendering must move together.
 */

export type TelegramAlertType =
  | "order_placed"
  | "order_delivered"
  | "order_failed"
  | "recharge_request"
  | "recharge_approved"
  | "recharge_rejected"
  | "support_message"
  | "support_reply"
  | "low_wallet"
  | "low_stock"
  | "wallet_adjusted"
  | "new_customer"
  | "sweep_stalled";

export async function enqueueTelegramAlert(input: {
  type: TelegramAlertType;
  payload: Json;
  dedupKey?: string;
  /** When set, delivered to the linked customer chat instead of the owner. */
  userId?: string;
}): Promise<void> {
  if (!hasServiceRoleKey()) {
    return;
  }

  try {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase.from("telegram_alerts").upsert(
      {
        type: input.type,
        payload: input.payload,
        ...(input.userId ? { user_id: input.userId } : {}),
        ...(input.dedupKey ? { dedup_key: input.dedupKey } : {}),
      },
      {
        onConflict: input.dedupKey ? "type,dedup_key" : undefined,
        // A re-enqueued dedup event must not resurrect a delivered alert.
        ignoreDuplicates: Boolean(input.dedupKey),
      },
    );

    if (error) {
      logFailure("telegram", "enqueue_failed", error, { type: input.type });
    }
  } catch (error) {
    logFailure("telegram", "enqueue_threw", error, { type: input.type });
  }

  // Owner-facing alerts (no customer recipient) also land in every admin's bell.
  if (!input.userId) {
    const mirrored = toAdminNotification(input.type, input.payload);

    if (mirrored) {
      await notifyAdmins(mirrored);
    }
  }
}

type Payload = Record<string, unknown>;

function field(payload: Json, key: string): string {
  const value = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Payload)[key] : undefined;

  return value === undefined || value === null ? "" : String(value);
}

function toAdminNotification(type: TelegramAlertType, payload: Json): Omit<NotifyInput, "userId"> | null {
  const make = (
    kind: AdminNotificationType,
    titleAr: string,
    titleEn: string,
    bodyAr: string,
    bodyEn: string,
    href: string,
    entityType?: string,
    entityId?: string,
  ): Omit<NotifyInput, "userId"> => ({
    type: kind,
    titleAr,
    titleEn,
    bodyAr,
    bodyEn,
    href,
    entityType: entityType ?? null,
    entityId: entityId && /^[0-9a-f-]{36}$/i.test(entityId) ? entityId : null,
  });

  switch (type) {
    case "order_placed": {
      const number = field(payload, "order_number");
      const total = field(payload, "total");
      const id = field(payload, "order_id");

      return make(
        "admin_order_placed",
        "طلب جديد",
        "New order",
        `طلب ${number} بقيمة ${total} دولار.`,
        `Order ${number} for ${total} USD.`,
        id ? `/dashboard/orders/${id}` : "/dashboard/orders",
        "order",
        id,
      );
    }
    case "recharge_request": {
      const reference = field(payload, "reference");
      const amount = field(payload, "amount");
      const method = field(payload, "method");
      const id = field(payload, "request_id");

      return make(
        "admin_recharge_request",
        "طلب شحن جديد",
        "New recharge request",
        `${reference} — ${amount} دولار عبر ${method}.`,
        `${reference} — ${amount} USD via ${method}.`,
        "/dashboard/recharges",
        "recharge",
        id,
      );
    }
    case "support_message": {
      const subject = field(payload, "subject");
      const id = field(payload, "thread_id");

      return make(
        "admin_support_message",
        "رسالة دعم جديدة",
        "New support message",
        subject || "رسالة جديدة من زبون.",
        subject || "A customer sent a new message.",
        id ? `/dashboard/support?thread=${id}` : "/dashboard/support",
        "support_thread",
        id,
      );
    }
    case "low_wallet":
      return make(
        "admin_low_wallet",
        "رصيد المزوّد منخفض",
        "Supplier balance is low",
        `رصيد ${field(payload, "provider") || "المزوّد"} أصبح ${field(payload, "balance")}.`,
        `${field(payload, "provider") || "Supplier"} balance is down to ${field(payload, "balance")}.`,
        "/dashboard/providers",
      );
    case "low_stock":
      return make(
        "admin_low_stock",
        "مخزون منخفض",
        "Low stock",
        `بقي ${field(payload, "remaining")} في المخزون لعرض ${field(payload, "offer_name") || field(payload, "offer_id")}.`,
        `${field(payload, "remaining")} left in stock for ${field(payload, "offer_name") || field(payload, "offer_id")}.`,
        "/dashboard/catalog",
      );
    case "new_customer":
      return make(
        "admin_new_customer",
        "زبون جديد",
        "New customer",
        `${field(payload, "email") || field(payload, "name") || "حساب جديد"} أنشأ حسابًا.`,
        `${field(payload, "email") || field(payload, "name") || "A new account"} signed up.`,
        "/dashboard/customers",
      );
    case "sweep_stalled":
      return make(
        "admin_sweep_stalled",
        "توقفت مزامنة الطلبات",
        "Order sweep stalled",
        "لم تعمل مزامنة الطلبات في وقتها. افتح الطلبات وتحقّق.",
        "The order sweep did not run on time. Open orders and check.",
        "/dashboard/orders",
      );
    default:
      return null;
  }
}
