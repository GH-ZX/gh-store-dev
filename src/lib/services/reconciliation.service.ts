import "server-only";

import { log } from "@/lib/logging/logger";
import { GRACE_MINUTES } from "@/lib/orders/reconciliation-policy";
import { syncBinanceInvoice } from "@/lib/services/binance-recharge.service";
import { reconcileOrder, type ReconcileOutcome } from "@/lib/services/fulfillment.service";
import { G2BULK_PROVIDER_NAME } from "@/providers/g2bulk/mapping";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * The sweep that finishes what checkout could not wait for.
 *
 * An order the supplier had not settled within checkout's ten-second budget is
 * left at `fulfilling`, and until this existed nothing ever went back to it. The
 * customer had paid, the supplier was working, and the only way the order ever
 * moved again was an operator noticing it and pressing Retry.
 *
 * The sweep only ever polls — {@link reconcileOrder} has no purchase path — so
 * the worst a runaway schedule can do is ask the supplier the same question
 * repeatedly.
 */

/** Kept small: a Worker has a wall-clock budget, and unfinished orders carry to the next run. */
const DEFAULT_BATCH = 10;

/**
 * Statuses that mean the customer has paid and the goods are not out yet.
 *
 * `paid` is included because in-chat checkout (the Telegram bot) places the
 * order and leaves it `paid` — the supplier is asked by this sweep, since the
 * bot has no server-side fulfilment code to run itself.
 */
const STUCK_STATUSES = ["paid", "fulfilling", "processing"];

/**
 * Sam invoices whose deadline passed with no money arriving.
 *
 * An invoice normally dies one of two ways: the payment screen polls it past
 * its 15 minutes, or Sam's own `invoice.expired` callback reports the death.
 * Neither is guaranteed — a customer who closes the tab and never transfers
 * produces neither event, and the row sits `pending` forever, holding a
 * recharge request open. Closing it here is bookkeeping, not judgement: if the
 * money somehow arrives after expiry, Sam's own callback path already routes
 * that to a human instead of crediting automatically.
 */
async function expireStaleSamInvoices(): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const neverExpiresCutoff = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data, error } = await supabase
    .from("sam_invoices")
    .select("sam_invoice_id")
    .eq("status", "pending")
    .or(`expires_at.lt.${now},and(expires_at.is.null,created_at.lt.${neverExpiresCutoff})`)
    .limit(20);

  if (error) {
    log.warn("payments", "sam_expiry_lookup_failed", { error: error.message });

    return 0;
  }

  let expired = 0;

  for (const invoice of data ?? []) {
    const { error: failError } = await supabase.rpc("fail_sam_invoice", {
      p_sam_invoice_id: invoice.sam_invoice_id,
      p_status: "expired",
      p_payload: { source: "sweep" },
    });

    if (failError) {
      // One refusal must not block the rest; the next sweep picks it up again.
      log.warn("payments", "sam_expiry_failed", {
        error: failError.message,
      });
      continue;
    }

    expired += 1;
  }

  return expired;
}

/**
 * Binance invoices whose deadline passed with no money arriving.
 *
 * Same bookkeeping as the Sam expiry above, for the same reason: a customer who
 * closes the checkout and never pays leaves a pending row behind, and a row
 * that never closes keeps its recharge request open against the customer's
 * five-request quota.
 */
async function expireStaleBinanceInvoices(): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const neverExpiresCutoff = new Date(Date.now() - 60 * 60_000).toISOString();

  const { data, error } = await supabase
    .from("binance_invoices")
    .select("merchant_trade_no")
    .eq("status", "pending")
    .or(`expires_at.lt.${now},and(expires_at.is.null,created_at.lt.${neverExpiresCutoff})`)
    .limit(20);

  if (error) {
    log.warn("payments", "binance_expiry_lookup_failed", { error: error.message });

    return 0;
  }

  let expired = 0;

  for (const invoice of data ?? []) {
    const { error: failError } = await supabase.rpc("fail_binance_invoice", {
      p_merchant_trade_no: invoice.merchant_trade_no,
      p_status: "expired",
      p_payload: { source: "sweep" },
    });

    if (failError) {
      // One refusal must not block the rest; the next sweep picks it up again.
      log.warn("payments", "binance_expiry_failed", {
        error: failError.message,
      });
      continue;
    }

    expired += 1;
  }

  return expired;
}

/**
 * Ask Binance about pending invoices whose notification may never arrive.
 *
 * This is the backstop that makes a lost webhook cost minutes instead of money:
 * settlement depends on somebody asking Binance, and until this ran the webhook
 * was the only thing that ever did. The sweep only queries — crediting still
 * requires Binance itself to say paid — so a runaway schedule can do no more
 * than repeat a question.
 *
 * Oldest first, small batch: each call is a provider request, and anything not
 * reached carries to the next run.
 */
async function settlePendingBinanceInvoices(): Promise<{ checked: number; credited: number }> {
  const supabase = createSupabaseServiceClient();
  const cutoff = new Date(Date.now() - 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("binance_invoices")
    .select("merchant_trade_no")
    .eq("status", "pending")
    // A minute old at least: an invoice from this very second is still being
    // opened in a browser somewhere, and asking twice changes nothing.
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    log.warn("payments", "binance_settle_lookup_failed", { error: error.message });

    return { checked: 0, credited: 0 };
  }

  let checked = 0;
  let credited = 0;

  for (const invoice of data ?? []) {
    try {
      const result = await syncBinanceInvoice(invoice.merchant_trade_no);

      checked += 1;

      if (result.ok && result.credited) {
        credited += 1;
      }
    } catch (caught) {
      // One failure must not end the batch; the next sweep asks again.
      log.warn("payments", "binance_sweep_invoice_failed", {
        merchantTradeNo: invoice.merchant_trade_no,
        error: caught instanceof Error ? caught.message : String(caught),
      });
    }
  }

  return { checked, credited };
}

/**
 * Close top-up requests nothing will ever credit.
 *
 * Two ways a request dies unattended: its provider invoice closed without the
 * money arriving (the customer abandoned the checkout), or it simply sat too
 * long — thirty days — waiting for an owner review that never came. Either way
 * the open row is doing harm: it counts against the customer's five open
 * requests, permanently wedging them out of topping up, and it sits in the
 * owner's queue as if it were live.
 *
 * Runs after both expiries above, so requests freed by a just-expired invoice
 * are released the same run. A payment that lands after its request expired is
 * refused by the credit RPC and surfaces on the payments screen — visible, not
 * silent.
 */
async function expireStaleRechargeRequests(): Promise<number> {
  const supabase = createSupabaseServiceClient();

  const deadInvoiceStatuses = ["failed", "expired", "cancelled"];
  const [samDead, binanceDead] = await Promise.all([
    supabase.from("sam_invoices").select("recharge_request_id").in("status", deadInvoiceStatuses).limit(50),
    supabase.from("binance_invoices").select("recharge_request_id").in("status", deadInvoiceStatuses).limit(50),
  ]);

  const requestIdSet = new Set<string>();

  for (const row of [...(samDead.data ?? []), ...(binanceDead.data ?? [])]) {
    if (row.recharge_request_id) {
      requestIdSet.add(row.recharge_request_id);
    }
  }

  const ageCutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
  const { data: aged } = await supabase
    .from("recharge_requests")
    .select("id")
    .in("status", ["pending", "payment_sent"])
    .lt("created_at", ageCutoff)
    .limit(50);

  for (const row of aged ?? []) {
    requestIdSet.add(row.id);
  }

  if (requestIdSet.size === 0) {
    return 0;
  }

  const ids = [...requestIdSet];

  let expired = 0;

  /*
   * In chunks so one huge backlog cannot build a statement Postgres chokes on.
   */
  const CHUNK = 100;

  for (let index = 0; index < ids.length; index += CHUNK) {
    const { data, error } = await supabase
      .from("recharge_requests")
      .update({ status: "expired" })
      .in("id", ids.slice(index, index + CHUNK))
      .in("status", ["pending", "payment_sent"])
      .select("id");

    if (error) {
      log.warn("payments", "recharge_request_expiry_failed", { error: error.message });
      continue;
    }

    expired += data?.length ?? 0;
  }

  return expired;
}

export type ReconcileRun = {
  checked: number;
  completed: number;
  refunded: number;
  escalated: number;
  waiting: number;
  skipped: number;
  /** Sam invoices this run closed as expired because their deadline passed. */
  samExpired: number;
  /** Binance invoices this run closed as expired because their deadline passed. */
  binanceExpired: number;
  /** Binance invoices this run asked Binance about, and how many credited. */
  binanceChecked: number;
  binanceCredited: number;
  /** Top-up requests this run closed as expired with no money behind them. */
  requestsExpired: number;
  results: { orderId: string; orderNumber: string; action: string; reason?: string }[];
};

/**
 * Orders worth asking about.
 *
 * Ordered oldest first: an order that has been waiting longest is both the most
 * likely to have settled at the supplier and the one whose customer has been
 * waiting the longest to hear. The grace period is applied in SQL so a batch is
 * never spent on orders a checkout is still working on.
 */
async function findStuckOrders(limit: number): Promise<{ id: string; order_number: string }[]> {
  const supabase = createSupabaseServiceClient();
  const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();

  const { data } = await supabase
    .from("orders")
    .select("id, order_number")
    .in("status", STUCK_STATUSES)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  return data ?? [];
}

/**
 * Record the run so an operator can see the sweep is alive.
 *
 * Reuses `provider_sync_logs`, which already exists for the catalog imports and
 * carries exactly the shape a run needs. A sweep nobody can see is a sweep
 * nobody can tell has stopped.
 */
async function recordRun(run: ReconcileRun, startedAt: string): Promise<void> {
  const supabase = createSupabaseServiceClient();

  const details = {
    results: run.results,
    payments: {
      samExpired: run.samExpired,
      binanceChecked: run.binanceChecked,
      binanceCredited: run.binanceCredited,
      binanceExpired: run.binanceExpired,
      requestsExpired: run.requestsExpired,
    },
  };

  await supabase.from("provider_sync_logs").insert({
    provider_name: G2BULK_PROVIDER_NAME,
    // `reconciliation` was declared in the original schema and never used.
    kind: "reconciliation",
    status: run.escalated > 0 ? "partial" : "succeeded",
    requested_count: run.checked,
    created_count: run.completed,
    updated_count: run.refunded,
    skipped_count: run.waiting + run.skipped,
    failed_count: run.escalated,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb column
    details: details as any,
  });
}

export async function reconcileStuckOrders(limit = DEFAULT_BATCH): Promise<ReconcileRun> {
  const startedAt = new Date().toISOString();
  const run: ReconcileRun = {
    checked: 0,
    completed: 0,
    refunded: 0,
    escalated: 0,
    waiting: 0,
    skipped: 0,
    samExpired: 0,
    binanceExpired: 0,
    binanceChecked: 0,
    binanceCredited: 0,
    requestsExpired: 0,
    results: [],
  };

  if (!hasServiceRoleKey()) {
    return run;
  }

  // Run independent lookups in parallel to stay within the Worker CPU budget.
  const [samExpired, binanceExpired, binance] = await Promise.all([
    expireStaleSamInvoices(),
    expireStaleBinanceInvoices(),
    settlePendingBinanceInvoices(),
  ]);
  run.samExpired = samExpired;
  run.binanceExpired = binanceExpired;
  run.binanceChecked = binance.checked;
  run.binanceCredited = binance.credited;

  // Last, so a request freed by an invoice expired above is released this run.
  run.requestsExpired = await expireStaleRechargeRequests();

  const orders = await findStuckOrders(limit);

  /*
   * Sequential on purpose. Each order is a supplier request and a possible
   * refund, and the supplier rate-limits; a burst of parallel calls would earn a
   * 429 for the whole batch and settle none of them.
   */
  for (const order of orders) {
    let outcome: ReconcileOutcome;

    try {
      outcome = await reconcileOrder(order.id);
    } catch (error) {
      // One order that throws must not end the sweep: the rest of the batch is
      // still waiting, and this one will be picked up again next run.
      outcome = {
        action: "skipped",
        reason: error instanceof Error ? error.message : "Unknown failure.",
      };
    }

    run.checked += 1;
    run.results.push({
      orderId: order.id,
      orderNumber: order.order_number,
      action: outcome.action,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
    });

    if (outcome.action === "completed") {
      run.completed += 1;
    } else if (outcome.action === "refunded") {
      run.refunded += 1;
    } else if (outcome.action === "escalated") {
      run.escalated += 1;
    } else if (outcome.action === "wait") {
      run.waiting += 1;
    } else {
      run.skipped += 1;
    }
  }

  if (
    run.checked > 0 ||
    run.samExpired > 0 ||
    run.binanceExpired > 0 ||
    run.binanceChecked > 0 ||
    run.requestsExpired > 0
  ) {
    await recordRun(run, startedAt);
    log.info("fulfilment", "reconciliation_run", {
      checked: run.checked,
      completed: run.completed,
      refunded: run.refunded,
      escalated: run.escalated,
      waiting: run.waiting,
      samExpired: run.samExpired,
      binanceChecked: run.binanceChecked,
      binanceCredited: run.binanceCredited,
      binanceExpired: run.binanceExpired,
      requestsExpired: run.requestsExpired,
    });
  }

  return run;
}

/** The most recent sweep, for the dashboard. */
export type LastReconcileRun = {
  status: string;
  checked: number;
  completed: number;
  refunded: number;
  escalated: number;
  finishedAt: string | null;
  startedAt: string;
};

export async function getLastReconcileRun(): Promise<LastReconcileRun | null> {
  if (!hasServiceRoleKey()) {
    return null;
  }

  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("provider_sync_logs")
    .select("status, requested_count, created_count, updated_count, failed_count, started_at, finished_at")
    .eq("kind", "reconciliation")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    status: data.status,
    checked: data.requested_count,
    completed: data.created_count,
    refunded: data.updated_count,
    escalated: data.failed_count,
    startedAt: data.started_at,
    finishedAt: data.finished_at,
  };
}
