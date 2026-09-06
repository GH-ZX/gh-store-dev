import { describe, expect, it } from "vitest";
import { isCacheableHtml, isCrossOriginMutation, isPublicHtmlRequest } from "../../storefront/workers/request-policy";
import { safeRedirectTarget } from "@server/lib/auth/redirect-target";

const documentRequest = (path: string, init: RequestInit = {}) => new Request(`https://store.example${path}`, {
  ...init, headers: { accept: "text/html", ...init.headers },
});

describe("anonymous document cache boundary", () => {
  it.each(["/en", "/ar/products", "/en/vouchers/sample-product"])("permits public catalog documents: %s", (path) => {
    expect(isPublicHtmlRequest(documentRequest(path))).toBe(true);
  });

  it.each(["login", "forgot-password", "reset-password", "profile", "wallet", "orders", "checkout", "recharge", "notifications", "support", "dashboard", "search", "telegram-connect"])
    ("excludes private or action routes including nested %s paths", (path) => {
      for (const locale of ["ar", "en"]) {
        expect(isPublicHtmlRequest(documentRequest(`/${locale}/${path}`))).toBe(false);
        expect(isPublicHtmlRequest(documentRequest(`/${locale}/${path}/detail`))).toBe(false);
      }
    });

  it("excludes sessions, router data, APIs, and mutation requests", () => {
    expect(isPublicHtmlRequest(documentRequest("/en", { headers: { cookie: "session=customer" } }))).toBe(false);
    expect(isPublicHtmlRequest(documentRequest("/en.data"))).toBe(false);
    expect(isPublicHtmlRequest(documentRequest("/en/products.data"))).toBe(false);
    expect(isPublicHtmlRequest(documentRequest("/api/search/suggest"))).toBe(false);
    expect(isPublicHtmlRequest(documentRequest("/en", { method: "POST" }))).toBe(false);
    expect(isPublicHtmlRequest(new Request("https://store.example/en", { headers: { accept: "application/json" } }))).toBe(false);
  });

  it("caches only successful public HTML without session cookies", () => {
    const html = (headers: Record<string, string> = {}, status = 200) => new Response("page", {
      status, headers: { "content-type": "text/html; charset=utf-8", ...headers },
    });
    expect(isCacheableHtml(html())).toBe(true);
    expect(isCacheableHtml(html({ "set-cookie": "session=refreshed" }))).toBe(false);
    for (const value of ["private, max-age=60", "no-store", "no-cache"]) {
      expect(isCacheableHtml(html({ "cache-control": value }))).toBe(false);
    }
    expect(isCacheableHtml(html({}, 403))).toBe(false);
    expect(isCacheableHtml(html({}, 500))).toBe(false);
    expect(isCacheableHtml(Response.json({ userId: "customer" }))).toBe(false);
  });
});

describe("mutation and redirect protection", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects cross-origin %s requests", (method) => {
    expect(isCrossOriginMutation(documentRequest("/en/profile", { method, headers: { origin: "https://attacker.example" } }))).toBe(true);
    expect(isCrossOriginMutation(documentRequest("/en/profile", { method, headers: { origin: "null" } }))).toBe(true);
    expect(isCrossOriginMutation(documentRequest("/en/profile", { method, headers: { "sec-fetch-site": "cross-site" } }))).toBe(true);
    expect(isCrossOriginMutation(documentRequest("/en/profile", { method, headers: { origin: "https://store.example" } }))).toBe(false);
  });

  it.each(["GET", "HEAD", "OPTIONS"])("allows safe %s requests regardless of origin", (method) => {
    expect(isCrossOriginMutation(documentRequest("/en", { method, headers: { origin: "https://other.example" } }))).toBe(false);
  });

  it.each(["https://attacker.example", "//attacker.example", "/\\attacker.example", "/%5cattacker.example", "/en%0d%0aLocation:evil", "/%ZZ"])
    ("rejects unsafe post-login destinations: %s", (path) => {
      expect(safeRedirectTarget(path)).toBeNull();
    });

  it("preserves a local destination including query and hash", () => {
    expect(safeRedirectTarget("/en/orders?status=pending#latest")).toBe("/en/orders?status=pending#latest");
  });
});
