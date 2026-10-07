import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminId, requireUserId } from "@server/lib/auth/guards";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { recordAudit } from "@server/lib/services/admin-audit.service";
import { logFailure } from "@server/lib/logging/logger";

/**
 * The customer half of the Telegram channel.
 *
 * The owner already had a bot; what was missing was a way to reach *registered*
 * customers rather than whoever happened to be looking at the site. This module
 * composes the message, snapshots the audience and hands it to the database;
 * the Worker delivers it on its five-minute drain.
 *
 * Nothing here sends anything. The one rule the existing alert queue already
 * encodes — alerting must never break the thing it reports on — applies here
 * too, so an outage in the send path leaves the broadcast `queued` with a
 * visible per-recipient record rather than throwing into a page.
 *
 * Owner alerts are untouched: they are the `user_id is null` branch of the same
 * queue, rendered by `ownerAlertText`. A customer never receives one.
 */

export type BroadcastAudience = "all" | "buyers" | "non_buyers";

export type BroadcastStatus = "draft" | "queued" | "sending" | "sent" | "cancelled";

export type Broadcast = {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href: string | null;
  audience: BroadcastAudience;
  status: BroadcastStatus;
  couponCode: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  createdAt: string;
  queuedAt: string | null;
  finishedAt: string | null;
};

export type BroadcastRecipient = {
  id: number;
  userId: string;
  chatId: number | null;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  error: string | null;
  attempts: number;
  sentAt: string | null;
  lastAttemptedAt: string | null;
  customerName: string | null;
  customerEmail: string | null;
};

type BroadcastRow = {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  href: string | null;
  audience: string;
  status: string;
  coupon_code: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  queued_at: string | null;
  finished_at: string | null;
};

const BROADCAST_COLUMNS =
  "id, title_ar, title_en, body_ar, body_en, href, audience, status, coupon_code, recipient_count, sent_count, failed_count, skipped_count, created_at, queued_at, finished_at";

function toBroadcast(row: BroadcastRow): Broadcast {
  return {
    id: row.id,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    bodyAr: row.body_ar,
    bodyEn: row.body_en,
    href: row.href,
    audience: (["all", "buyers", "non_buyers"] as const).includes(row.audience as BroadcastAudience)
      ? (row.audience as BroadcastAudience)
      : "all",
    status: (["draft", "queued", "sending", "sent", "cancelled"] as const).includes(
      row.status as BroadcastStatus,
    )
      ? (row.status as BroadcastStatus)
      : "draft",
    couponCode: row.coupon_code,
    recipientCount: row.recipient_count,
    sentCount: row.sent_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    createdAt: row.created_at,
    queuedAt: row.queued_at,
    finishedAt: row.finished_at,
  };
}

export async function listBroadcasts(supabase: SupabaseClient, limit = 50): Promise<Broadcast[]> {
  await requireAdminId(supabase);

  const { data, error } = await supabase
    .from("telegram_broadcasts")
    .select(BROADCAST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as unknown as BroadcastRow[]).map(toBroadcast);
}

export async function getBroadcast(
  supabase: SupabaseClient,
  id: string,
): Promise<Broadcast | null> {
  await requireAdminId(supabase);

  const { data, error } = await supabase
    .from("telegram_broadcasts")
    .select(BROADCAST_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toBroadcast(data as unknown as BroadcastRow);
}

/**
 * Who a broadcast would reach, counted before it is sent.
 *
 * The audience choice is made by the database (`broadcast_recipients`), so the
 * number on the button and the number of rows that get queued come from one
 * definition. Blocked chats are excluded from the count and recorded as
 * `skipped` when the send is queued, so the delivery record adds up.
 */
export async function countAudience(
  supabase: SupabaseClient,
  audience: BroadcastAudience,
): Promise<{ linked: number; blocked: number; buyers: number; nonBuyers: number }> {
  await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  const [links, purchases] = await Promise.all([
    service.from("telegram_chat_links").select("user_id, delivery_status"),
    service.rpc("customer_purchase_state"),
  ]);

  const blockedIds = new Set(
    ((links.data ?? []) as { user_id: string; delivery_status: string }[])
      .filter((row) => row.delivery_status === "blocked")
      .map((row) => row.user_id),
  );
  const linkedIds = ((links.data ?? []) as { user_id: string }[]).map((row) => row.user_id);

  const buyers = new Set(
    ((purchases.data ?? []) as { user_id: string; has_purchase: boolean }[])
      .filter((row) => row.has_purchase)
      .map((row) => row.user_id),
  );

  const reachable = linkedIds.filter((id) => !blockedIds.has(id));

  const buyersLinked = reachable.filter((id) => buyers.has(id)).length;

  return {
    linked: reachable.length,
    blocked: blockedIds.size,
    buyers: buyersLinked,
    nonBuyers: reachable.length - buyersLinked,
  };
}

export type BroadcastInput = {
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  href: string | null;
  audience: BroadcastAudience;
  couponCode: string | null;
  /** Queue it straight away, or leave it as a draft to review. */
  queue: boolean;
};

export type BroadcastWriteResult = { ok: true; id: string } | { ok: false; reason: string };

export async function createBroadcast(
  supabase: SupabaseClient,
  input: BroadcastInput,
): Promise<BroadcastWriteResult> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  const { data, error } = await service
    .from("telegram_broadcasts")
    .insert({
      title_ar: input.titleAr,
      title_en: input.titleEn,
      body_ar: input.bodyAr,
      body_en: input.bodyEn,
      href: input.href,
      audience: input.audience,
      coupon_code: input.couponCode,
      created_by: actor.id,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    logFailure("telegram", "broadcast_create_failed", error);

    return { ok: false, reason: "unknown" };
  }

  await recordAudit({
    actorId: actor.id,
    action: "telegram_broadcast_created",
    entityType: "telegram_broadcast",
    entityId: data.id,
    values: { ...input },
  });

  if (input.queue) {
    const queued = await queueBroadcast(supabase, data.id);

    if (!queued.ok) {
      return queued;
    }
  }

  return { ok: true, id: data.id };
}

/** Snapshot the audience and hand the send to the Worker's drain. */
export async function queueBroadcast(
  supabase: SupabaseClient,
  id: string,
): Promise<BroadcastWriteResult> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  const { error } = await service.rpc("queue_telegram_broadcast", { p_broadcast_id: id });

  if (error) {
    logFailure("telegram", "broadcast_queue_failed", error, { broadcastId: id });

    return { ok: false, reason: error.message.toLowerCase().includes("already queued") ? "already_queued" : "unknown" };
  }

  await recordAudit({
    actorId: actor.id,
    action: "telegram_broadcast_queued",
    entityType: "telegram_broadcast",
    entityId: id,
    values: {},
  });

  return { ok: true, id };
}

export async function cancelBroadcast(
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  const actor = await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  const { error } = await service
    .from("telegram_broadcasts")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["draft", "queued"]);

  if (error) {
    return false;
  }

  await recordAudit({
    actorId: actor.id,
    action: "telegram_broadcast_cancelled",
    entityType: "telegram_broadcast",
    entityId: id,
    values: {},
  });

  return true;
}

/** The delivery record: who got it, who did not, and why. */
export async function listBroadcastRecipients(
  supabase: SupabaseClient,
  broadcastId: string,
  limit = 200,
): Promise<BroadcastRecipient[]> {
  await requireAdminId(supabase);
  const service = createSupabaseServiceClient();

  const { data, error } = await service
    .from("telegram_broadcast_recipients")
    .select(
      "id, user_id, chat_id, status, error, attempts, sent_at, last_attempted_at, profiles (full_name, email)",
    )
    .eq("broadcast_id", broadcastId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  type Profile = { full_name: string | null; email: string | null } | null;

  return (data as unknown as {
    id: number;
    user_id: string;
    chat_id: number | null;
    status: BroadcastRecipient["status"];
    error: string | null;
    attempts: number;
    sent_at: string | null;
    last_attempted_at: string | null;
    profiles: Profile | Profile[];
  }[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

    return {
      id: row.id,
      userId: row.user_id,
      chatId: row.chat_id,
      status: row.status,
      error: row.error,
      attempts: row.attempts,
      sentAt: row.sent_at,
      lastAttemptedAt: row.last_attempted_at,
      customerName: profile?.full_name ?? null,
      customerEmail: profile?.email ?? null,
    };
  });
}

// ─── Customer-side interest ────────────────────────────────────────────────

/**
 * The customer's own "tell me when this changes" list.
 *
 * A restock or price-drop alert only ever goes to somebody who is on this
 * list, which is what keeps the detector honest: it cannot invent an audience.
 */
export type OfferInterest = {
  offerId: string;
  productId: string;
  productName: string;
  productSlug: string;
  categorySlug: string | null;
  createdAt: string;
};

export async function listMyInterests(supabase: SupabaseClient): Promise<OfferInterest[]> {
  const user = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("customer_offer_interests")
    .select(
      "offer_id, product_id, created_at, offers (name_ar, name_en, products (slug, name_ar, name_en, categories (slug)))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  type Row = {
    offer_id: string;
    product_id: string;
    created_at: string;
    offers:
      | {
          name_ar: string;
          name_en: string;
          products:
            | { slug: string; name_ar: string; name_en: string; categories: { slug: string } | { slug: string }[] | null }
            | { slug: string; name_ar: string; name_en: string; categories: { slug: string } | { slug: string }[] | null }[]
            | null;
        }
      | {
          name_ar: string;
          name_en: string;
          products:
            | { slug: string; name_ar: string; name_en: string; categories: { slug: string } | { slug: string }[] | null }
            | { slug: string; name_ar: string; name_en: string; categories: { slug: string } | { slug: string }[] | null }[]
            | null;
        }[]
      | null;
  };

  return (data as unknown as Row[]).flatMap((row) => {
    const offer = Array.isArray(row.offers) ? row.offers[0] : row.offers;

    if (!offer) {
      return [];
    }

    const product = Array.isArray(offer.products) ? offer.products[0] : offer.products;
    const category = product ? (Array.isArray(product.categories) ? product.categories[0] : product.categories) : null;

    return [
      {
        offerId: row.offer_id,
        productId: row.product_id,
        productName: product?.name_en ?? offer.name_en,
        productSlug: product?.slug ?? "",
        categorySlug: category?.slug ?? null,
        createdAt: row.created_at,
      },
    ];
  });
}

/** Ask to be told when this offer is cheaper or back in stock. */
export async function watchOffer(supabase: SupabaseClient, offerId: string): Promise<boolean> {
  const user = await requireUserId(supabase);
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc("record_offer_interest", {
    p_offer_id: offerId,
    p_user_id: user.id,
    p_source: "manual",
  });

  if (error) {
    logFailure("telegram", "interest_record_failed", error, { offerId });

    return false;
  }

  return data === true || data === null;
}

/**
 * Remember what a customer bought, so restock and price-drop alerts have an
 * audience that is not a guess.
 *
 * Called after a delivered order. `p_source = 'purchase'` distinguishes "you
 * bought this" from "you asked about this" in the record.
 */
export async function recordPurchaseInterests(
  userId: string,
  offerIds: string[],
): Promise<number> {
  const unique = [...new Set(offerIds.filter(Boolean))];

  if (unique.length === 0) {
    return 0;
  }

  const service = createSupabaseServiceClient();
  let recorded = 0;

  for (const offerId of unique) {
    const { error } = await service.rpc("record_offer_interest", {
      p_offer_id: offerId,
      p_user_id: userId,
      p_source: "purchase",
    });

    if (!error) {
      recorded += 1;
    }
  }

  return recorded;
}

/**
 * Mirror a customer-targeted announcement into the in-site inbox.
 *
 * The Telegram channel reaches the customers who linked a chat (2 of the 36
 * accounts today); the inbox reaches all of them. The row is keyed by
 * `entity_type = 'telegram_broadcast'` and the broadcast id, and the caller
 * filters on that key before calling this — so a broadcast that is mirrored
 * twice does not become two inbox rows.
 *
 * The write goes through the service client on purpose: a notification is the
 * store telling a customer something, and a customer must not be able to
 * invent one.
 */
export async function mirrorBroadcastToInbox(
  broadcast: Broadcast,
  userIds: string[],
): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }

  const service = createSupabaseServiceClient();
  const rows = userIds.map((userId) => ({
    user_id: userId,
    notification_type: "admin_message",
    title_ar: broadcast.titleAr,
    title_en: broadcast.titleEn,
    body_ar: broadcast.bodyAr,
    body_en: broadcast.bodyEn,
    href: broadcast.href,
    entity_type: "telegram_broadcast",
    entity_id: broadcast.id,
  }));

  let delivered = 0;

  // Chunked so one very large broadcast cannot exceed the request size limit.
  for (let index = 0; index < rows.length; index += 200) {
    const chunk = rows.slice(index, index + 200);
    const { error } = await service.from("notifications").insert(chunk);

    if (error) {
      logFailure("telegram", "broadcast_inbox_mirror_failed", error, { broadcastId: broadcast.id });
      continue;
    }

    delivered += chunk.length;
  }

  return delivered;
}
