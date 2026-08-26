// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- `.open-next/worker.js` only exists after an OpenNext build
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";
import { runTelegramScheduled, type BotEnv } from "./worker/telegram-bot";

type ReconcileEnv = BotEnv;

/** `waitUntil` is all the Worker runtime and this module need from the context. */
type WorkerContext = { waitUntil(promise: Promise<unknown>): void };

type ScheduledContext = WorkerContext;

function workerLog(event: string, fields: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      time: new Date().toISOString(),
      area: "fulfilment",
      event,
      ...fields,
    }),
  );
}

function reconciliationUrl(appUrl: string): string | null {
  try {
    const url = new URL(appUrl);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    url.pathname = "/api/reconcile";
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function isPublicHtmlRequest(request: Request): boolean {
  if (request.method !== "GET" || request.headers.get("cookie")) {
    return false;
  }

  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/html")) {
    return false;
  }

  // RSC and router prefetch responses are not complete documents and must not
  // share a cache entry with a browser navigation.
  if (
    request.headers.has("rsc") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-url")
  ) {
    return false;
  }

  const url = new URL(request.url);
  if (!/^\/(?:ar|en)(?:\/|$)/.test(url.pathname)) {
    return false;
  }

  // Account, checkout, search, and admin routes can contain user-specific data.
  return !/^\/(?:ar|en)\/(?:login|forgot-password|reset-password|profile|wallet|orders|checkout|recharge|notifications|support|dashboard|search|telegram-connect)(?:\/|$)/.test(
    url.pathname,
  );
}

async function cachedPublicHtml(
  request: Request,
  env: Record<string, unknown>,
  ctx: WorkerContext,
): Promise<Response> {
  const cache = (globalThis as typeof globalThis & { caches?: { default: Cache } }).caches?.default;

  if (!cache || !isPublicHtmlRequest(request)) {
    return handler.fetch(request, env, ctx);
  }

  let cached: Response | undefined;

  try {
    cached = await cache.match(request);
  } catch (error) {
    workerLog("public_cache_read_failed", {
      error: error instanceof Error ? error.message : "Unknown failure.",
    });
  }

  if (cached) {
    const response = new Response(cached.body, cached);
    response.headers.set("x-gh-store-cache", "HIT");
    return response;
  }

  const response = await handler.fetch(request, env, ctx);
  const contentType = response.headers.get("content-type") ?? "";

  if (response.status !== 200 || !contentType.includes("text/html") || response.headers.has("set-cookie")) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
  headers.set("x-gh-store-cache", "MISS");
  const cacheable = new Response(response.body, { status: response.status, headers });
  ctx.waitUntil(
    cache.put(request, cacheable.clone()).catch((error: unknown) => {
      workerLog("public_cache_write_failed", {
        error: error instanceof Error ? error.message : "Unknown failure.",
      });
    }),
  );
  return cacheable;
}

const worker = {
  async fetch(request: Request, env: Record<string, unknown>, ctx: WorkerContext) {
    return cachedPublicHtml(request, env, ctx);
  },

  async scheduled(_event: unknown, env: ReconcileEnv, ctx: ScheduledContext) {
    const secret = env.RECONCILE_CRON_SECRET?.trim();
    const url = env.NEXT_PUBLIC_APP_URL?.trim()
      ? reconciliationUrl(env.NEXT_PUBLIC_APP_URL.trim())
      : null;

    // Hard deadline: the Worker gets ~30 s CPU on the paid plan. Leave a safety
    // margin so the isolate is not killed mid-write.
    const deadline = Date.now() + 25_000;
    const withinBudget = () => Date.now() < deadline;

    // Independent jobs: reconciliation for orders, Telegram for owner alerts.
    const jobs: Promise<void>[] = [];

    if (secret && url) {
      jobs.push(
        fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${secret}`,
            accept: "application/json",
          },
        })
          .then(async (response) => {
            if (!response.ok) {
              workerLog("reconcile_http_failure", {
                status: response.status,
                statusText: response.statusText,
              });
              return;
            }

            workerLog("reconcile_triggered", { status: response.status });
          })
          .catch((error: unknown) => {
            workerLog("reconcile_request_failed", {
              error: error instanceof Error ? error.message : "Unknown failure.",
            });
          }),
      );
    } else {
      workerLog("reconcile_not_configured", {
        hasSecret: Boolean(secret),
        hasValidAppUrl: Boolean(url),
      });
    }

    // `runTelegramScheduled` resolves the URL itself (falling back to the
    // public var), so only the service key needs checking here.
    if (withinBudget() && env.SUPABASE_SERVICE_ROLE_KEY) {
      jobs.push(runTelegramScheduled(env));
    }

    if (jobs.length > 0) {
      ctx.waitUntil(Promise.all(jobs));
    }
  },
};

export default worker;
