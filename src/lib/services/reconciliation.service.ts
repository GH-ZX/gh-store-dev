import "server-only";

import { log } from "@/lib/logging/logger";
import { GRACE_MINUTES } from "@/lib/orders/reconciliation-policy";
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
const DEFAULT_BATCH = 25;

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
    .limit(50);

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

export type ReconcileRun = {
  checked: number;
  completed: number;
  refunded: number;
  escalated: number;
  waiting: number;
  skipped: number;
  /** Sam invoices this run closed as expired because their deadline passed. */
  samExpired: number;
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
    details: { results: run.results } as any,
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
    results: [],
  };

  if (!hasServiceRoleKey()) {
    return run;
  }

  run.samExpired = await expireStaleSamInvoices();

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

  if (run.checked > 0 || run.samExpired > 0) {
    await recordRun(run, startedAt);
    log.info("fulfilment", "reconciliation_run", {
      checked: run.checked,
      completed: run.completed,
      refunded: run.refunded,
      escalated: run.escalated,
      waiting: run.waiting,
      samExpired: run.samExpired,
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
