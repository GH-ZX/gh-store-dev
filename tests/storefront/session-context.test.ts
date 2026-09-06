import { beforeEach, describe, expect, it, vi } from "vitest";

type Cookie = { name: string; value: string; options?: Record<string, unknown> };
type CookieAdapter = { getAll(): Cookie[]; setAll(cookies: Cookie[]): void };

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn(), adapters: [] as CookieAdapter[] }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { createSessionClient, redirectToLogin, serializeCookie, withSessionCookies } from "@server/session";
import { getRequestState, memoizeRequest, withRequestContext } from "@server/request-context";
import { createSupabaseServerClient } from "@server/lib/supabase/server";
import { ForbiddenError, UnauthorizedError, requireAdmin, requireAuth } from "@server/lib/auth/guards";

const env = { SUPABASE_URL: "https://unit-test.supabase.co", SUPABASE_PUBLISHABLE_KEY: "test-public-key" };
const requestFor = (user: string) => new Request("https://store.example/en/orders", { headers: { cookie: `session=${user}` } });

beforeEach(() => {
  mocks.adapters.length = 0;
  mocks.createServerClient.mockImplementation((_url: string, _key: string, { cookies }: { cookies: CookieAdapter }) => {
    mocks.adapters.push(cookies);
    const user = cookies.getAll().find((cookie) => cookie.name === "session")?.value;
    return {
      auth: { getClaims: vi.fn(async () => ({ data: { claims: user ? { sub: user } : {} }, error: null })) },
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { role: user?.startsWith("admin") ? "admin" : "customer", is_active: user !== "admin-disabled" },
        error: null,
      }) }) }) })),
    };
  });
});

describe("session cookies", () => {
  it("preserves deletion and expiration attributes so logout clears the browser cookie", () => {
    const expires = new Date("1970-01-01T00:00:00Z");
    expect(serializeCookie({ name: "session", value: "", options: { maxAge: 0, expires } }, true))
      .toBe("session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(serializeCookie({ name: "session", value: "a=b c", options: { maxAge: 60.9 } }, false))
      .toBe("session=a%3Db%20c; Path=/; HttpOnly; SameSite=Lax; Max-Age=60");
  });

  it("uses the request scheme for Secure, including HTTPS preview deployments", () => {
    expect(createSessionClient(new Request("https://preview.example/en"), env).isProduction).toBe(true);
    expect(createSessionClient(new Request("http://localhost:5173/en"), { ...env, APP_URL: "https://gh-store.me" }).isProduction).toBe(false);
  });

  it("reads encoded cookies and immediately exposes refresh writes only to that request", () => {
    const first = createSessionClient(new Request("https://store.example", { headers: { cookie: "session=a%3Db; malformed=%ZZ" } }), env);
    const second = createSessionClient(requestFor("customer-b"), env);
    expect(mocks.adapters[0].getAll()).toEqual([{ name: "session", value: "a=b" }, { name: "malformed", value: "%ZZ" }]);
    mocks.adapters[0].setAll([{ name: "session", value: "refreshed", options: { maxAge: 3600 } }]);
    expect(mocks.adapters[0].getAll()).toContainEqual({ name: "session", value: "refreshed" });
    expect(mocks.adapters[1].getAll()).toEqual([{ name: "session", value: "customer-b" }]);
    expect(first.jar.cookies).toHaveLength(1);
    expect(second.jar.cookies).toEqual([]);
  });

  it("attaches refresh cookies to immutable redirects and keeps the return destination", () => {
    const request = new Request("https://store.example/en/orders?status=pending");
    const redirect = redirectToLogin(request, "en", "/en/orders?status=pending");
    const response = withSessionCookies(redirect, { cookies: [{ name: "session", value: "refreshed" }] }, true);
    expect(response.status).toBe(302);
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/en/login");
    expect(destination.searchParams.get("next")).toBe("/en/orders?status=pending");
    expect(response.headers.get("set-cookie")).toContain("session=refreshed;");
    expect(redirect.headers.has("set-cookie")).toBe(false);
  });
});

describe("request-scoped authorization", () => {
  it("rejects session access outside an HTTP request", async () => {
    expect(() => getRequestState()).toThrow("active HTTP request");
    await expect(createSupabaseServerClient()).rejects.toThrow("active HTTP request");
  });

  it("keeps overlapping requests, memoized identities, and outgoing cookies isolated", async () => {
    let releaseFirst!: () => void;
    const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let signalFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve; });
    const first = withRequestContext(requestFor("customer-a"), env, async () => {
      const firstAuth = requireAuth();
      expect(requireAuth()).toBe(firstAuth);
      expect(await firstAuth).toEqual({ id: "customer-a" });
      signalFirstStarted();
      await firstMayFinish;
      expect(await requireAuth()).toEqual({ id: "customer-a" });
      expect(getRequestState().request.headers.get("cookie")).toBe("session=customer-a");
      expect(await createSupabaseServerClient()).toBe(getRequestState().supabase);
      expect(getRequestState().supabase.auth.getClaims).toHaveBeenCalledTimes(1);
      getRequestState().jar.cookies.push({ name: "session", value: "refresh-a" });
      return Response.json(await requireAuth());
    });
    await firstStarted;
    const second = await withRequestContext(requestFor("customer-b"), env, async () => {
      expect(await requireAuth()).toEqual({ id: "customer-b" });
      getRequestState().jar.cookies.push({ name: "session", value: "refresh-b" });
      return Response.json(await requireAuth());
    });
    releaseFirst();
    const firstResponse = await first;
    expect(await firstResponse.json()).toEqual({ id: "customer-a" });
    expect(await second.json()).toEqual({ id: "customer-b" });
    expect(firstResponse.headers.get("set-cookie")).toContain("session=refresh-a;");
    expect(second.headers.get("set-cookie")).toContain("session=refresh-b;");
    expect(() => getRequestState()).toThrow("active HTTP request");
  });

  it("requires a session for customer services and an active admin for administration", async () => {
    await withRequestContext(new Request("https://store.example/en/orders"), env, async () => {
      await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError);
      await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
      return new Response();
    });
    for (const user of ["customer-a", "admin-disabled"]) {
      await withRequestContext(requestFor(user), env, async () => {
        await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
        return new Response();
      });
    }
    await withRequestContext(requestFor("admin-active"), env, async () => {
      await expect(requireAdmin()).resolves.toEqual({ id: "admin-active" });
      return new Response();
    });
  });

  it("deduplicates service reads within a request but reloads on the next request", async () => {
    const load = vi.fn(async () => ({ balance: 12 }));
    for (let index = 0; index < 2; index++) {
      await withRequestContext(requestFor("customer-a"), env, async () => {
        const first = memoizeRequest("wallet", load);
        expect(memoizeRequest("wallet", load)).toBe(first);
        await first;
        return new Response();
      });
    }
    expect(load).toHaveBeenCalledTimes(2);
  });
});
