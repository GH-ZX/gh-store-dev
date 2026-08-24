import { NextResponse } from "next/server";
import { isReconcileAuthorized } from "@/lib/api/reconcile";
import { log, logFailure } from "@/lib/logging/logger";
import { reconcileStuckOrders } from "@/lib/services/reconciliation.service";
import { hasServiceRoleKey } from "@/lib/supabase/service";

/**
 * Scheduled fulfilment sweep.
 *
 * Checkout gives the supplier about ten seconds and then leaves the order at
 * `fulfilling`. This is what comes back for it later. It is an HTTP entrypoint
 * rather than a Supabase Edge Function on purpose: the reconciliation and the
 * refund it can trigger already exist here in TypeScript, and a second copy in
 * Deno would be two implementations of moving a customer's money, free to drift
 * apart. The scheduler calls this; the logic stays in one place.
 *
 * Authorized by a shared secret, compared in constant time against a digest so
 * the comparison leaks neither its length nor its content. There is no session
 * here — a scheduler has no user — so this secret is the only gate.
 *
 * The work itself is safe to run at any cadence: the sweep only ever polls the
 * supplier, and every settlement it can reach is idempotent in the database.
 */

export const dynamic = "force-dynamic";

function json<T>(body: T, status = 200, extraHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isReconcileAuthorized(request.headers, process.env.RECONCILE_CRON_SECRET)) {
    /*
     * This secret is the only gate on the endpoint, so someone trying it is
     * worth seeing. The presented value is never logged — only that there was
     * one, which is enough to tell a misconfigured scheduler (no header at all)
     * from a probe (a wrong one).
     */
    log.warn("fulfilment", "reconcile_unauthorized", {
      presented: request.headers.has("authorization"),
      configured: Boolean(process.env.RECONCILE_CRON_SECRET?.trim()),
    });

    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!hasServiceRoleKey()) {
    log.error("fulfilment", "reconcile_not_configured", {
      reason: "missing_service_role_key",
    });

    return json({ ok: false, error: "reconciliation_not_configured" }, 503, {
      "Retry-After": "300",
    });
  }

  try {
    const run = await reconcileStuckOrders();

    return json({
      ok: true,
      checked: run.checked,
      completed: run.completed,
      refunded: run.refunded,
      escalated: run.escalated,
      waiting: run.waiting,
      skipped: run.skipped,
      samExpired: run.samExpired,
    });
  } catch (error) {
    logFailure("fulfilment", "reconcile_failed", error);

    return json({ ok: false, error: "reconciliation_failed" }, 500);
  }
}

/** Explicit JSON response for probes and misconfigured schedulers. */
export function GET(): NextResponse {
  return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
}
