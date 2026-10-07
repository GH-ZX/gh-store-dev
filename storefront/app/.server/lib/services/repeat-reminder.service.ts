import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUserId } from "@server/lib/auth/guards";
import { createSupabaseServiceClient } from "@server/lib/supabase/service";
import { logFailure } from "@server/lib/logging/logger";

/**
 * Repeat-purchase reminders.
 *
 * What makes a product recurring is data, not a name: `offers.duration_value`
 * and `offers.duration_unit` are the structured terms the catalogue already
 * carries. A one-month subscription bought on 3 January is due on 3 February;
 * a 30-day top-up is due thirty days later. Nothing here reads a product title
 * looking for the word "monthly".
 *
 * The planning step is pure ({@link planRepeatReminders}) so the arithmetic,
 * the dedup rule and the "they already bought it again" rule can be tested
 * without a database. The service around it only reads and writes.
 *
 * Three things stop a reminder:
 *   * the customer opted out — `repeat_reminder_optouts`, written by the
 *     profile toggle and by the bot's `/stop`;
 *   * they bought the product again after the cycle came due;
 *   * this customer already has a reminder for this product and this cycle —
 *     the `(user_id, product_id, cycle_index)` unique index is the guarantee,
 *     so a cron that fires twice cannot send twice.
 */

export type ReminderUnit = "hour" | "day" | "month" | "year";

/** One customer's paid, delivered purchase of a recurring offer. */
export type ReminderSubscription = {
  userId: string;
  productId: string;
  offerId: string;
  productSlug: string;
  productNameAr: string;
  productNameEn: string;
  offerNameAr: string;
  offerNameEn: string;
  durationValue: number;
  durationUnit: ReminderUnit;
  /** When the most recent delivered, paid purchase of the offer happened. */
  purchasedAt: Date;
  languageCode: string | null;
};

export type ReminderContext = {
  now: Date;
  /** Keys already written, `user:product:cycle`. */
  alreadySent: ReadonlySet<string>;
  optedOut: ReadonlySet<string>;
  /** Paid, delivered purchases that happened *after* a given time, per user+product. */
  laterPurchases: ReadonlyMap<string, Date>;
  /** How stale a reminder may be before it is dropped instead of queued. */
  overdueDays: number;
  /** The newest reminder this run may produce, per product. */
  maxPerRun: number;
};

export type ReminderCandidate = {
  key: string;
  userId: string;
  productId: string;
  offerId: string;
  cycleIndex: number;
  dueAt: Date;
  href: string;
  languageCode: string | null;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  channel: "both";
};

export function reminderKey(userId: string, productId: string, cycleIndex: number): string {
  return `${userId}:${productId}:${cycleIndex}`;
}

/**
 * A date plus one interval, with a fixed month length.
 *
 * `Date.setUTCMonth` on 31 January yields 3 March, which would drift a monthly
 * subscription by days every cycle. Clamping the target day to the last day of
 * the target month keeps 31 January + 1 month at 28 February, which is what a
 * customer expects.
 */
export function addInterval(from: Date, value: number, unit: ReminderUnit): Date {
  const next = new Date(from.getTime());
  const amount = Math.max(Math.trunc(value) || 1, 1);

  switch (unit) {
    case "hour":
      next.setUTCHours(next.getUTCHours() + amount);
      return next;
    case "day":
      next.setUTCDate(next.getUTCDate() + amount);
      return next;
    case "month": {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + amount);
      const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
      return next;
    }
    default: {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCFullYear(next.getUTCFullYear() + amount);
      const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
      return next;
    }
  }
}

/** The first cycle that has not come due yet. Always at least 1. */
export function nextCycleIndex(purchasedAt: Date, now: Date, value: number, unit: ReminderUnit): number {
  let index = 1;

  // A bounded walk rather than arithmetic: hourly cycles need more iterations
  // than monthly ones, and 4000 steps covers a decade of hourly renewals while
  // still terminating on a corrupt duration.
  while (index < 4000 && addInterval(purchasedAt, index * Math.max(Math.trunc(value) || 1, 1), unit).getTime() <= now.getTime()) {
    index += 1;
  }

  return index;
}

/**
 * The reminder this subscription is owed right now, or nothing.
 *
 * Returns `null` for every ordinary "not yet" case, including the two that
 * matter most: an opted-out customer and one who already bought it again.
 */
export function evaluateReminder(
  subscription: ReminderSubscription,
  context: ReminderContext,
): ReminderCandidate | null {
  const { now, overdueDays, alreadySent, optedOut, laterPurchases } = context;

  if (optedOut.has(subscription.userId)) {
    return null;
  }

  const value = Math.max(Math.trunc(subscription.durationValue) || 1, 1);
  const dueIndex = nextCycleIndex(subscription.purchasedAt, now, value, subscription.durationUnit);

  if (dueIndex <= 1) {
    return null;
  }

  const cycleIndex = dueIndex - 1;
  const dueAt = addInterval(subscription.purchasedAt, cycleIndex * value, subscription.durationUnit);

  // Only the cycle that is currently current. An older cycle is exactly the
  // reminder that was already sent (or deliberately skipped).
  if (dueAt.getTime() > now.getTime()) {
    return null;
  }

  const overdueLimit = now.getTime() - overdueDays * 24 * 60 * 60 * 1000;

  if (dueAt.getTime() < overdueLimit) {
    return null;
  }

  // They bought it again since the cycle came due: nothing to remind about.
  const later = laterPurchases.get(`${subscription.userId}:${subscription.productId}`);

  if (later && later.getTime() > dueAt.getTime()) {
    return null;
  }

  const key = reminderKey(subscription.userId, subscription.productId, cycleIndex);

  if (alreadySent.has(key)) {
    return null;
  }

  const offerNameAr = subscription.offerNameAr || subscription.productNameAr;
  const offerNameEn = subscription.offerNameEn || subscription.productNameEn;
  const href = `/checkout/${encodeURIComponent(subscription.productSlug)}/${encodeURIComponent(
    subscription.offerId,
  )}`;

  return {
    key,
    userId: subscription.userId,
    productId: subscription.productId,
    offerId: subscription.offerId,
    cycleIndex,
    dueAt,
    href,
    languageCode: subscription.languageCode,
    titleAr: `وقت التجديد — ${subscription.productNameAr}`,
    titleEn: `Time to renew — ${subscription.productNameEn}`,
    bodyAr: `اشتراكك في ${offerNameAr} يقترب من موعده. أعد الشراء من صفحة العرض.`,
    bodyEn: `Your ${offerNameEn} is due again. Buy it from the offer page.`,
    channel: "both",
  };
}

/**
 * The whole due list for one run.
 *
 * Deduplicated by `key` and capped per product, so a customer who bought the
 * same product from three offers does not receive three reminders in one
 * morning.
 */
export function planRepeatReminders(
  subscriptions: ReminderSubscription[],
  context: ReminderContext,
): ReminderCandidate[] {
  const byProduct = new Map<string, number>();
  const picked: ReminderCandidate[] = [];

  // Most overdue first, so the cap keeps the ones that matter.
  const ordered = [...subscriptions].sort((a, b) => a.purchasedAt.getTime() - b.purchasedAt.getTime());

  for (const subscription of ordered) {
    const candidate = evaluateReminder(subscription, context);

    if (!candidate) {
      continue;
    }

    const groupKey = `${candidate.userId}:${candidate.productId}`;
    const used = byProduct.get(groupKey) ?? 0;

    if (used >= context.maxPerRun) {
      continue;
    }

    byProduct.set(groupKey, used + 1);
    picked.push(candidate);
  }

  return picked;
}

// ─── Reads ─────────────────────────────────────────────────────────────────

export async function isReminderOptedOut(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("repeat_reminder_optouts")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Turn reminders on or off for the signed-in customer.
 *
 * Read and write go through the customer's own session: RLS scopes both rows
 * to them, and opting out is a preference, not an admin action.
 */
export async function setMyReminderOptOut(
  supabase: SupabaseClient,
  optedOut: boolean,
): Promise<boolean> {
  const user = await requireUserId(supabase);

  if (optedOut) {
    const { error } = await supabase
      .from("repeat_reminder_optouts")
      .upsert({ user_id: user.id, reason: "customer_preference" }, { onConflict: "user_id" });

    return !error;
  }

  const { error } = await supabase.from("repeat_reminder_optouts").delete().eq("user_id", user.id);

  return !error;
}

export type ReminderHistoryRow = {
  id: string;
  title: string;
  status: string;
  cycleIndex: number;
  dueAt: string;
  sentAt: string | null;
  createdAt: string;
};

export async function listMyReminders(
  supabase: SupabaseClient,
  limit = 25,
): Promise<ReminderHistoryRow[]> {
  const user = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("repeat_reminders")
    .select("id, title_ar, title_en, status, cycle_index, due_at, sent_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  return (data as unknown as {
    id: string;
    title_ar: string;
    title_en: string;
    status: string;
    cycle_index: number;
    due_at: string;
    sent_at: string | null;
    created_at: string;
  }[]).map((row) => ({
    id: row.id,
    title: row.title_en || row.title_ar,
    status: row.status,
    cycleIndex: row.cycle_index,
    dueAt: row.due_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }));
}

// ─── The run ───────────────────────────────────────────────────────────────

export type ReminderRun = {
  planned: number;
  queued: number;
  skipped: number;
  preview: ReminderCandidate[];
};

/**
 * Compose the due reminders and queue them.
 *
 * Called from the Worker's cron. Every insert is `on conflict do nothing`
 * against `(user_id, product_id, cycle_index)`, so the queue is the dedup
 * boundary even if two runs overlap.
 */
export async function queueRepeatReminders(limit = 25, now = new Date()): Promise<ReminderRun> {
  const service = createSupabaseServiceClient();

  const [{ data: dueRows, error: dueError }, { data: sentRows }, { data: optoutRows }] =
    await Promise.all([
      service.rpc("due_repeat_reminders", { p_limit: limit }),
      service.from("repeat_reminders").select("user_id, product_id, cycle_index"),
      service.from("repeat_reminder_optouts").select("user_id"),
    ]);

  if (dueError) {
    logFailure("reminders", "due_query_failed", dueError);

    return { planned: 0, queued: 0, skipped: 0, preview: [] };
  }

  type DueRow = {
    user_id: string;
    product_id: string;
    offer_id: string;
    cycle_index: number;
    due_at: string;
    purchased_at: string;
    product_slug: string;
    product_name_ar: string;
    product_name_en: string;
    offer_slug: string;
    offer_name_ar: string;
    offer_name_en: string;
    duration_value: number;
    duration_unit: string;
    language_code: string | null;
  };

  const rows = (dueRows ?? []) as unknown as DueRow[];

  if (rows.length === 0) {
    return { planned: 0, queued: 0, skipped: 0, preview: [] };
  }

  const alreadySent = new Set(
    ((sentRows ?? []) as { user_id: string; product_id: string; cycle_index: number }[]).map((row) =>
      reminderKey(row.user_id, row.product_id, row.cycle_index),
    ),
  );
  const optedOut = new Set(((optoutRows ?? []) as { user_id: string }[]).map((row) => row.user_id));

  const subscriptions: ReminderSubscription[] = rows.map((row) => ({
    userId: row.user_id,
    productId: row.product_id,
    offerId: row.offer_id,
    productSlug: row.product_slug,
    productNameAr: row.product_name_ar,
    productNameEn: row.product_name_en,
    offerNameAr: row.offer_name_ar,
    offerNameEn: row.offer_name_en,
    durationValue: row.duration_value,
    durationUnit: (["hour", "day", "month", "year"] as const).includes(row.duration_unit as ReminderUnit)
      ? (row.duration_unit as ReminderUnit)
      : "month",
    purchasedAt: new Date(row.purchased_at),
    languageCode: row.language_code,
  }));

  const planned = planRepeatReminders(subscriptions, {
    now,
    alreadySent,
    optedOut,
    // The database already answered "did they buy it again", so an empty map is
    // the honest input here rather than a second, divergent answer.
    laterPurchases: new Map(),
    overdueDays: 90,
    maxPerRun: 1,
  });

  if (planned.length === 0) {
    return { planned: 0, queued: 0, skipped: rows.length, preview: [] };
  }

  let queued = 0;

  for (const candidate of planned) {
    const { error } = await service.from("repeat_reminders").insert({
      user_id: candidate.userId,
      product_id: candidate.productId,
      offer_id: candidate.offerId,
      cycle_index: candidate.cycleIndex,
      due_at: candidate.dueAt.toISOString(),
      title_ar: candidate.titleAr,
      title_en: candidate.titleEn,
      body_ar: candidate.bodyAr,
      body_en: candidate.bodyEn,
      href: candidate.href,
      channel: candidate.channel,
      status: "pending",
    });

    if (error) {
      // 23505 is the unique index doing its job: this cycle was already queued.
      if (error.code !== "23505") {
        logFailure("reminders", "insert_failed", error, { userId: candidate.userId });
      }
      continue;
    }

    queued += 1;
  }

  return { planned: planned.length, queued, skipped: rows.length - planned.length, preview: planned };
}
