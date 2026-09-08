import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("../../storefront/node_modules/react-router/dist/development/index.js", async (original) => ({
  ...await original<typeof import("../../storefront/node_modules/react-router/dist/development/index.js")>(),
  createRequestHandler: () => runtime.render,
}));
vi.mock("../../storefront/app/.server/runtime-env", () => ({ initRuntimeEnv: vi.fn() }));
vi.mock("../../storefront/app/.server/request-context", () => ({
  withRequestContext: (_request: Request, _env: unknown, run: () => unknown) => run(),
}));
vi.mock("virtual:react-router/server-build", () => ({}));

import worker from "../../storefront/workers/app";
import { checkRateLimit, rateLimitStore, TIERS } from "../../storefront/workers/rate-limiter";

const now = 1_700_000_000_000;
const entries = new Map<string, Response>();
let pending: Promise<unknown>[] = [];
const cache = {
  match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
  put: vi.fn(async (request: Request, response: Response) => {
    entries.set(request.url, new Response(await response.text(), response));
  }),
};
const html = (body = "<html><body>Current catalog price: $12</body></html>", headers: Record<string, string> = {}) =>
  new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", ...headers } });
const document = (path: string, headers: Record<string, string> = {}) => new Request(`https://gh-store.me${path}`, {
  headers: { accept: "text/html", "cf-connecting-ip": "203.0.113.5", ...headers },
});

function fetchWorker(request: Request) {
  return worker.fetch(request, { APP_URL: "https://gh-store.me" } as Parameters<typeof worker.fetch>[1], {
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    passThroughOnException: () => {},
  } as unknown as Parameters<typeof worker.fetch>[2]);
}

beforeEach(() => {
  entries.clear();
  pending = [];
  rateLimitStore.clear();
  cache.match.mockClear();
  cache.put.mockClear();
  runtime.render.mockReset().mockImplementation(() => html());
  vi.stubEnv("DEV", false);
  vi.stubGlobal("caches", { default: cache });
  vi.spyOn(Date, "now").mockReturnValue(now);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Worker catalog cache response boundaries", () => {
  it("stores a 30-second clone while both browser MISS and HIT responses require revalidation", async () => {
    const request = document("/en/ai/assistant");
    const miss = await fetchWorker(request);
    await Promise.all(pending);
    const stored = entries.get(request.url)!;
    expect(stored.headers.get("Cache-Control")).toBe("public, max-age=30, s-maxage=30");
    expect(miss.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(miss.headers.get("X-Edge-Cache")).toBe("MISS");
    expect(miss.headers.has("X-Storefront-Cache-Version")).toBe(false);
    expect(await miss.text()).toContain("Current catalog price: $12");

    const hit = await fetchWorker(request);
    expect(hit.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(hit.headers.get("X-Edge-Cache")).toBe("HIT");
    expect(hit.headers.has("X-Storefront-Cache-Version")).toBe(false);
    expect(await hit.text()).toContain("Current catalog price: $12");
    expect(runtime.render).toHaveBeenCalledOnce();
    expect(cache.put).toHaveBeenCalledOnce();
    // Visitor header/body handling cannot mutate or consume the stored copy.
    expect(stored.headers.get("Cache-Control")).toBe("public, max-age=30, s-maxage=30");
    expect(await stored.clone().text()).toContain("Current catalog price: $12");
  });

  it("replaces older long-lived entries instead of serving stale prices after deployment", async () => {
    const request = document("/en/ai/assistant");
    entries.set(request.url, html("<html>Outdated price: $5</html>", {
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    }));
    const response = await fetchWorker(request);
    await Promise.all(pending);
    expect(response.headers.get("X-Edge-Cache")).toBe("MISS");
    expect(response.headers.get("Cache-Control")).not.toContain("stale-while-revalidate");
    expect(await response.text()).toContain("Current catalog price: $12");
    expect(entries.get(request.url)?.headers.get("Cache-Control")).toBe("public, max-age=30, s-maxage=30");
    expect(runtime.render).toHaveBeenCalledOnce();
  });

  it("bypasses shared cache and prevents browser storage for session-bearing requests", async () => {
    const request = document("/en/ai/assistant", { cookie: "session=customer" });
    runtime.render.mockImplementation(() => html("<html>Customer session</html>"));
    const response = await fetchWorker(request);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toContain("Customer session");
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("never stores or applies public browser policy to a newly issued session", async () => {
    runtime.render.mockImplementation(() => html("<html>New session</html>", { "Set-Cookie": "session=new; HttpOnly; Secure" }));
    const response = await fetchWorker(document("/en/ai/assistant"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Set-Cookie")).toContain("session=new");
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("preserves explicit private response policy and excludes router data from HTML caching", async () => {
    runtime.render.mockImplementation(() => html("<html>Private response</html>", { "Cache-Control": "private, no-store" }));
    const privateResponse = await fetchWorker(document("/en/ai/assistant"));
    expect(privateResponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(cache.put).not.toHaveBeenCalled();
    cache.match.mockClear();
    await fetchWorker(document("/en/products.data"));
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe("Worker media rate-limit isolation", () => {
  it("rejects exhausted media requests while allowing product data, auth callbacks, and robots", async () => {
    const media = document("/api/media-proxy?url=https%3A%2F%2Fimages.example%2Fitem.png");
    for (let index = 0; index < TIERS.MEDIA.limit; index++) {
      expect(checkRateLimit(media, now).allowed).toBe(true);
    }
    const blocked = await fetchWorker(media);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("X-RateLimit-Tier")).toBe("media");
    for (const path of ["/en/products.data", "/auth/callback?code=sample", "/robots.txt"]) {
      expect((await fetchWorker(document(path))).status, path).toBe(200);
    }
    expect(runtime.render).toHaveBeenCalledTimes(3);
  });
});
