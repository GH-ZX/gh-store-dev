import { createRequestHandler, RouterContextProvider } from "react-router";
import { initRuntimeEnv } from "../app/.server/runtime-env";
import { cloudflareContext } from "../app/lib/cloudflare-context";
import { withRequestContext } from "../app/.server/request-context";
import {
  canonicalHostRedirect,
  isCacheableHtml,
  isCrossOriginMutation,
  isPublicHtmlRequest,
  legacyProductRedirect,
  resolveCachePolicy,
} from "./request-policy";
import { applyEarlyHintHeaders, applySecurityHeaders } from "./response-headers";
import { buildRateLimitResponse, checkRateLimit } from "./rate-limiter";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

type CloudflareContextValue = {
  env: Record<string, string | undefined>;
  ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void };
};

// Entries from the previous hour-long policy must be replaced on first access.
const HTML_CACHE_VERSION = "catalog-30s-v1";
const BROWSER_HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate";

async function handleRequest(
  request: Request,
  contextValue: CloudflareContextValue,
): Promise<Response> {
  const loadContext = new RouterContextProvider();
  loadContext.set(cloudflareContext, contextValue);
  const response = await withRequestContext(request, contextValue.env, () => requestHandler(request, loadContext));
  const secured = new Response(response.body, response);
  applySecurityHeaders(secured.headers);
  if (isPublicHtmlRequest(request)) applyEarlyHintHeaders(secured.headers);
  if (request.headers.has("cookie") || secured.headers.has("set-cookie")) {
    secured.headers.set("Cache-Control", "private, no-store");
  }
  return secured;
}


export default {
  async fetch(request, env, ctx) {
    if (isCrossOriginMutation(request)) return new Response("Forbidden", { status: 403 });
    const canonical = canonicalHostRedirect(request, env.APP_URL);
    if (canonical) {
      const response = new Response(null, { status: 301, headers: { Location: canonical.toString() } });
      applySecurityHeaders(response.headers);
      return response;
    }
    const rateLimit = checkRateLimit(request);
    if (!rateLimit.allowed) {
      const response = buildRateLimitResponse(request, rateLimit);
      applySecurityHeaders(response.headers);
      return response;
    }
    const legacy = legacyProductRedirect(request);
    if (legacy) {
      const response = new Response(null, { status: 308, headers: { Location: legacy.toString() } });
      applySecurityHeaders(response.headers);
      return response;
    }
    // Deployment-static bindings for deep service code (secrets, base URLs).
    // First write wins per isolate; values are identical across requests.
    initRuntimeEnv(env as unknown as Record<string, string | undefined>);

    const contextValue = {
      env: env as unknown as Record<string, string | undefined>,
      ctx: ctx as unknown as CloudflareContextValue["ctx"],
    };

    // Anonymous edge HTML cache: a visitor with no session sees identical
    // bytes, so a short-lived colo copy absorbs the database round trips that
    // dominate cold renders. Signed-in traffic always bypasses (Cookie), and a
    // response that sets a cookie is never stored — a session must not leak
    // into a shared entry, in either direction.
    if (!import.meta.env.DEV && isPublicHtmlRequest(request)) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/")) {
        const cache = (caches as unknown as { default: Cache }).default;
        const cached = await cache.match(request).catch(() => undefined);
        if (cached?.headers.get("X-Storefront-Cache-Version") === HTML_CACHE_VERSION) {
          const hit = new Response(cached.body, cached);
          hit.headers.set("Cache-Control", BROWSER_HTML_CACHE_CONTROL);
          hit.headers.delete("X-Storefront-Cache-Version");
          hit.headers.set("X-Edge-Cache", "HIT");
          return hit;
        }
        // Release an obsolete entry's response stream before rendering its replacement.
        if (cached) void cached.body?.cancel().catch(() => undefined);
        const response = await handleRequest(request, contextValue);
        if (isCacheableHtml(response)) {
          // Clone first: the visitor's body must stay untouched. Sharing the
          // stream serves empty pages and throws 1101 in production.
          const stored = response.clone();
          const policy = resolveCachePolicy(request);
          stored.headers.set(
            "Cache-Control",
            `public, max-age=${policy.ttlSeconds}, s-maxage=${policy.ttlSeconds}`,
          );
          stored.headers.set("Cache-Tag", policy.tags.join(", "));
          stored.headers.set("X-Storefront-Cache-Version", HTML_CACHE_VERSION);
          response.headers.set("Cache-Control", BROWSER_HTML_CACHE_CONTROL);
          response.headers.set("X-Edge-Cache", "MISS");
          ctx.waitUntil(
            cache.put(request, stored).catch((error: unknown) => {
              console.log(
                JSON.stringify({ level: "warn", area: "edge-cache", event: "put_failed", error: String(error) }),
              );
            }),
          );
        }
        return response;
      }
    }
    return handleRequest(request, contextValue);
  },
  async scheduled(event, env, ctx) {
    const botEnv = env as unknown as import("./telegram-bot").BotEnv;
    if (botEnv.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.waitUntil((async () => {
        const { checkSweepHeartbeat, runTelegramScheduled } = await import("./telegram-bot");
        await checkSweepHeartbeat(botEnv);
        await runTelegramScheduled(botEnv);
      })().catch((error: unknown) => {
        console.error(JSON.stringify({ area: "telegram", event: "scheduled_failed", error: String(error) }));
      }));
    }
    // The fulfilment sweep: settles orders the supplier never finished in
    // front of the customer, and expires dead payment bookkeeping. Poll-only
    // by construction — reconcileOrder has no purchase path — so a runaway
    // schedule can repeat questions but never move money on its own.
    initRuntimeEnv(env as unknown as Record<string, string | undefined>);
    const { createServiceClient } = await import("../app/.server/session");
    const { reconcileStuckOrders } = await import("../app/.server/lib/services/reconciliation.service");
    const { recordSweepFailure, recordSweepSuccess } = await import(
      "../app/.server/lib/services/sweep-heartbeat.service"
    );
    const service = createServiceClient(env as unknown as import("../app/.server/env").StoreEnvVars);
    try {
      const run = await reconcileStuckOrders(service);
      await recordSweepSuccess(service);

      /*
       * The growth pass, on the same tick as the sweep: restock and price-drop
       * alerts, repeat-purchase reminders, referral credit for delivered
       * orders, and the purchase interests those alerts are aimed at. It runs
       * second because every one of them depends on an order having settled.
       * `runGrowthJobs` catches each step, so a marketing fault can never be
       * reported as a fulfilment fault.
       */
      const { runGrowthJobs } = await import("../app/.server/lib/services/growth.service");
      const growth = await runGrowthJobs();

      console.log(
        JSON.stringify({
          level: "info",
          area: "fulfilment",
          event: "reconciliation_run",
          cron: event.cron,
          checked: run.checked,
          completed: run.completed,
          refunded: run.refunded,
          escalated: run.escalated,
          waiting: run.waiting,
          growth,
        }),
      );
    } catch (error) {
      await recordSweepFailure(service, error);
      console.log(
        JSON.stringify({
          level: "error",
          area: "fulfilment",
          event: "reconcile_failed",
          cron: event.cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    /*
     * BatStore stock refresh, throttled inside the tick.
     *
     * BatStore is a Telegram bot with dynamic stock, so the store cannot wait
     * for an operator to press "import" before it stops selling an item the
     * supplier no longer has — two live orders were charged and then failed
     * with `Insufficient stock for product #16 (requested 1, available 0)`.
     *
     * This rides the existing 5-minute tick rather than adding a 30-minute cron:
     * there is no new infrastructure, no new CPU budget, and a stock snapshot is
     * at most 15 minutes old instead of 30. The sweep itself decides whether the
     * window has elapsed (see `DEFAULT_STOCK_SYNC_THROTTLE_MS`) and reads a
     * small batch of mappings, so most ticks do nothing but one indexed read.
     *
     * It is wrapped twice — the service never throws and this catch is a second
     * net — because an uncaught throw here would take the fulfilment sweep's
     * heartbeat with it.
     */
    try {
      const { runBatStoreStockSyncScheduled } = await import(
        "../app/.server/lib/services/batstore-stock-sync.service"
      );
      const stockRun = service ? await runBatStoreStockSyncScheduled(service) : null;
      if (stockRun?.ran) {
        console.log(
          JSON.stringify({
            level: "info",
            area: "provider.batstore",
            event: "stock_sync_run",
            cron: event.cron,
            scanned: stockRun.scanned,
            parked: stockRun.parked,
            unparked: stockRun.unparked,
            failed: stockRun.failed,
          }),
        );
      }
    } catch (error) {
      console.log(
        JSON.stringify({
          level: "error",
          area: "provider.batstore",
          event: "stock_sync_failed",
          cron: event.cron,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
