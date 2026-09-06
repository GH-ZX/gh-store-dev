import { isReconcileAuthorized } from "../.server/lib/api/reconcile";
import { log, logFailure } from "../.server/lib/logging/logger";
import { runtimeVar } from "../.server/runtime-env";
import { createSupabaseServiceClient, hasServiceRoleKey } from "../.server/lib/supabase/service";
import { reconcileStuckOrders } from "../.server/lib/services/reconciliation.service";
import { recordSweepFailure, recordSweepSuccess } from "../.server/lib/services/sweep-heartbeat.service";

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

/** Retains the shared-secret HTTP contract used by external sweep schedulers. */
export async function action({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "POST") return loader();

  const secret = runtimeVar("RECONCILE_CRON_SECRET");
  if (!isReconcileAuthorized(request.headers, secret)) {
    log.warn("fulfilment", "reconcile_unauthorized", {
      presented: request.headers.has("authorization"),
      configured: Boolean(secret),
    });
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!hasServiceRoleKey()) {
    log.error("fulfilment", "reconcile_not_configured", { reason: "missing_service_role_key" });
    return json({ ok: false, error: "reconciliation_not_configured" }, 503, { "Retry-After": "300" });
  }

  let service: ReturnType<typeof createSupabaseServiceClient> | null = null;
  try {
    service = createSupabaseServiceClient();
    const run = await reconcileStuckOrders(service);
    await recordSweepSuccess(service);
    return json({
      ok: true,
      checked: run.checked,
      completed: run.completed,
      refunded: run.refunded,
      escalated: run.escalated,
      waiting: run.waiting,
      skipped: run.skipped,
      samExpired: run.samExpired,
      binanceExpired: run.binanceExpired,
      binanceChecked: run.binanceChecked,
      binanceCredited: run.binanceCredited,
      requestsExpired: run.requestsExpired,
    });
  } catch (error) {
    logFailure("fulfilment", "reconcile_failed", error);
    await recordSweepFailure(service, error);
    return json({ ok: false, error: "reconciliation_failed" }, 500);
  }
}

export function loader(): Response {
  return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
}
