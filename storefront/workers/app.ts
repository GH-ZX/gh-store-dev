import { createRequestHandler, RouterContextProvider } from "react-router";
import { initRuntimeEnv } from "../app/.server/runtime-env";
import { cloudflareContext } from "../app/lib/cloudflare-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

type CloudflareContextValue = {
  env: Record<string, string | undefined>;
  ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void };
};

async function handleRequest(
  request: Request,
  contextValue: CloudflareContextValue,
): Promise<Response> {
  const loadContext = new RouterContextProvider();
  loadContext.set(cloudflareContext, contextValue);
  return requestHandler(request, loadContext);
}

/** Anonymous pages are identical for every visitor: cacheable for 30 seconds. */
const ANONYMOUS_CACHE_TTL = 30;

export default {
  async fetch(request, env, ctx) {
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
    if (request.method === "GET" && !request.headers.has("cookie")) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/auth/")) {
        const cache = caches.default;
        const cached = await cache.match(request);
        if (cached) {
          const hit = new Response(cached.body, cached);
          hit.headers.set("X-Edge-Cache", "HIT");
          return hit;
        }
        const response = await handleRequest(request, contextValue);
        const contentType = response.headers.get("content-type") ?? "";
        if (
          response.status === 200 &&
          contentType.includes("text/html") &&
          !response.headers.has("set-cookie")
        ) {
          // Clone first: the visitor's body must stay untouched. Sharing the
          // stream serves empty pages and throws 1101 in production.
          const stored = response.clone();
          stored.headers.set(
            "Cache-Control",
            `public, max-age=${ANONYMOUS_CACHE_TTL}, s-maxage=${ANONYMOUS_CACHE_TTL}`,
          );
          stored.headers.set("X-Edge-Cache", "MISS");
          ctx.waitUntil(
            cache.put(request, stored).catch((error) => {
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
    // Placeholder tick until the fulfilment sweep is ported: proves the cron
    // fires and the worker is alive, without touching money movement.
    console.log(
      JSON.stringify({
        level: "warn",
        area: "fulfilment",
        event: "reconcile_not_ported",
        cron: event.cron,
      }),
    );
  },
} satisfies ExportedHandler<Env>;
