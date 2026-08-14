import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { log } from "@/lib/logging/logger";
import { reconcileStuckOrders } from "@/lib/services/reconciliation.service";

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

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function authorized(request: Request): boolean {
  const expected = process.env.RECONCILE_CRON_SECRET?.trim();

  if (!expected) {
    return false;
  }

  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

  return header.length > 0 && timingSafeEqual(digest(header), digest(expected));
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorized(request)) {
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

    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const run = await reconcileStuckOrders();

  return NextResponse.json({ ok: true, ...run, results: undefined });
}
