import { createSupabaseServiceClient, hasServiceRoleKey } from "@server/lib/supabase/service";
import { log, logFailure } from "@server/lib/logging/logger";
import { queueRepeatReminders } from "@server/lib/services/repeat-reminder.service";

/**
 * The growth jobs, on the store's five-minute schedule.
 *
 * Four features need to look at data that has already settled rather than at a
 * request: a price that moved, a stock flag that flipped, a renewal that came
 * due, and a referral whose order finally delivered. None of them may throw
 * into the cron, so every step is caught, counted and logged.
 *
 * They live here rather than in the reconciliation service on purpose: the
 * sweep settles orders and moves money, and a marketing pass that fails must
 * not be able to look like a fulfilment failure.
 *
 * `enqueue_offer_change_alerts` is the piece that keeps restock and price-drop
 * alerts honest. It compares the catalogue against what the store last told
 * customers and queues a difference only when there is one, so this job can
 * run every five minutes without inventing a "price drop" every five minutes.
 */

export type GrowthRun = {
  offerAlertsQueued: number;
  offerAlertsRestocks: number;
  offerAlertsPriceDrops: number;
  remindersQueued: number;
  remindersSkipped: number;
  referralClaimsCredited: number;
  referralClaimsChecked: number;
  purchaseInterestsRecorded: number;
};

const EMPTY: GrowthRun = {
  offerAlertsQueued: 0,
  offerAlertsRestocks: 0,
  offerAlertsPriceDrops: 0,
  remindersQueued: 0,
  remindersSkipped: 0,
  referralClaimsCredited: 0,
  referralClaimsChecked: 0,
  purchaseInterestsRecorded: 0,
};

export async function runGrowthJobs(): Promise<GrowthRun> {
  if (!hasServiceRoleKey()) {
    return EMPTY;
  }

  const run: GrowthRun = { ...EMPTY };

  await step(run, "offer alerts", async () => {
    const { data, error } = await createSupabaseServiceClient().rpc("enqueue_offer_change_alerts", {
      p_limit: 25,
    });

    if (error) {
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { queued?: number; restocks?: number; price_drops?: number }
      | null
      | undefined;

    run.offerAlertsQueued = row?.queued ?? 0;
    run.offerAlertsRestocks = row?.restocks ?? 0;
    run.offerAlertsPriceDrops = row?.price_drops ?? 0;
  });

  await step(run, "repeat reminders", async () => {
    const result = await queueRepeatReminders(25);
    run.remindersQueued = result.queued;
    run.remindersSkipped = result.skipped;
  });

  await step(run, "referral credits", async () => {
    const credited = await settlePendingReferrals();
    run.referralClaimsCredited = credited.credited;
    run.referralClaimsChecked = credited.checked;
  });

  await step(run, "purchase interests", async () => {
    run.purchaseInterestsRecorded = await recordRecentPurchaseInterests();
  });

  log.info("growth", "growth_jobs_ran", { ...run });

  return run;
}

/** One step's failure is logged and counted as zero; the next step still runs. */
async function step(run: GrowthRun, name: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    logFailure("growth", "growth_step_failed", error, { step: name });
    void run;
  }
}

/**
 * Pay the referral claims whose referred customer has now been delivered.
 *
 * Only claims nothing has decided yet (`credit_checked_at is null`) are looked
 * at, and the RPC refuses to pay an order that is not paid and completed. So
 * this asks the question — it never answers it.
 */
async function settlePendingReferrals(): Promise<{ credited: number; checked: number }> {
  const service = createSupabaseServiceClient();
  const { data: claims, error } = await service
    .from("referral_claims")
    .select("id, referred_user_id")
    .eq("status", "pending")
    .is("credit_checked_at", null)
    .limit(25);

  if (error || !claims || claims.length === 0) {
    return { credited: 0, checked: 0 };
  }

  let credited = 0;
  let checked = 0;

  for (const claim of claims) {
    const { data: order } = await service
      .from("orders")
      .select("id")
      .eq("user_id", claim.referred_user_id)
      .eq("status", "completed")
      .eq("payment_status", "paid")
      .order("completed_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!order) {
      // Nothing delivered yet. Leave the claim undecided so the next run asks
      // again once the order settles.
      continue;
    }

    const { data, error: creditError } = await service.rpc("credit_referral_for_order", {
      p_order_id: order.id,
    });

    checked += 1;

    if (creditError) {
      logFailure("growth", "referral_credit_failed", creditError, { claimId: claim.id });
      continue;
    }

    const row = (Array.isArray(data) ? data[0] : data) as { status?: string } | null;

    if (row?.status === "credited") {
      credited += 1;
    }
  }

  return { credited, checked };
}

/**
 * Remember what was just bought, so restock and price-drop alerts have an
 * audience.
 *
 * `orders.interests_recorded_at` is the stamp that stops this re-reading the
 * same order every five minutes; it is set whether or not every item recorded,
 * because an offer that has since been deleted is not a reason to read the
 * order again forever.
 */
async function recordRecentPurchaseInterests(): Promise<number> {
  const service = createSupabaseServiceClient();
  const { data: orders, error } = await service
    .from("orders")
    .select("id, user_id, order_items (offer_id)")
    .eq("status", "completed")
    .eq("payment_status", "paid")
    .is("interests_recorded_at", null)
    .order("completed_at", { ascending: true })
    .limit(25);

  if (error || !orders || orders.length === 0) {
    return 0;
  }

  let recorded = 0;

  for (const order of orders) {
    const items = (order.order_items ?? []) as { offer_id: string | null }[];
    const offerIds = items.flatMap((item) => (item.offer_id ? [item.offer_id] : []));

    for (const offerId of offerIds) {
      const { error: interestError } = await service.rpc("record_offer_interest", {
        p_offer_id: offerId,
        p_user_id: order.user_id,
        p_source: "purchase",
      });

      if (!interestError) {
        recorded += 1;
      }
    }

    await service
      .from("orders")
      .update({ interests_recorded_at: new Date().toISOString() })
      .eq("id", order.id);
  }

  return recorded;
}
