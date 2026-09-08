import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../storefront/public/sw.js", import.meta.url), "utf8");
type LifecycleEvent = { waitUntil: (work: Promise<unknown>) => void };

function harness() {
  const handlers = new Map<string, (event: LifecycleEvent) => void>();
  const caches = {
    keys: vi.fn(async () => ["gh-store-v1", "gh-store-pwa-v2", "other-app-v1", "workbox-precache-v1", "gh-store-v2"]),
    delete: vi.fn(async (_key: string) => true),
    open: vi.fn(),
  };
  const self = {
    addEventListener: (type: string, handler: (event: LifecycleEvent) => void) => handlers.set(type, handler),
    skipWaiting: vi.fn(async () => undefined),
    registration: { unregister: vi.fn(async () => true) },
    clients: { claim: vi.fn(async () => undefined) },
  };
  const fetch = vi.fn();
  runInNewContext(source, { self, caches, fetch });
  async function lifecycle(type: "install" | "activate") {
    const work: Promise<unknown>[] = [];
    handlers.get(type)!({ waitUntil: (promise) => { work.push(promise); } });
    expect(work).toHaveLength(1);
    await Promise.all(work);
  }
  return { handlers, caches, self, fetch, lifecycle };
}

describe("service worker retirement", () => {
  it("awaits immediate activation on install without fetching or opening a cache", async () => {
    const sw = harness();
    await sw.lifecycle("install");
    expect(sw.self.skipWaiting).toHaveBeenCalledOnce();
    expect(sw.fetch).not.toHaveBeenCalled();
    expect(sw.caches.open).not.toHaveBeenCalled();
    expect(sw.caches.delete).not.toHaveBeenCalled();
  });

  it("only handles lifecycle events and never intercepts requests", () => {
    const sw = harness();
    expect([...sw.handlers.keys()]).toEqual(["install", "activate"]);
    expect(sw.handlers.has("fetch")).toBe(false);
  });

  it("removes known GH Store caches while preserving unrelated origin caches", async () => {
    const sw = harness();
    await sw.lifecycle("activate");
    expect(sw.caches.delete.mock.calls.map(([key]) => key)).toEqual(["gh-store-v1", "gh-store-pwa-v2"]);
    expect(sw.self.registration.unregister).toHaveBeenCalledOnce();
    expect(sw.self.clients.claim).toHaveBeenCalledOnce();
    expect(sw.caches.open).not.toHaveBeenCalled();
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it.each(["rejection", "synchronous error"])("continues retirement when cache listing has a %s", async (failure) => {
    const sw = harness();
    if (failure === "rejection") sw.caches.keys.mockRejectedValue(new Error("storage disabled"));
    else sw.caches.keys.mockImplementation(() => { throw new Error("storage disabled"); });
    await expect(sw.lifecycle("activate")).resolves.toBeUndefined();
    expect(sw.self.registration.unregister).toHaveBeenCalledOnce();
    expect(sw.self.clients.claim).toHaveBeenCalledOnce();
  });

  it.each(["rejection", "synchronous error"])("continues cleanup and retirement when deleting one cache has a %s", async (failure) => {
    const sw = harness();
    sw.caches.delete.mockImplementation((key) => {
      if (key !== "gh-store-v1") return Promise.resolve(true);
      if (failure === "rejection") return Promise.reject(new Error("storage disabled"));
      throw new Error("storage disabled");
    });
    await expect(sw.lifecycle("activate")).resolves.toBeUndefined();
    expect(sw.caches.delete.mock.calls.map(([key]) => key)).toEqual(["gh-store-v1", "gh-store-pwa-v2"]);
    expect(sw.self.registration.unregister).toHaveBeenCalledOnce();
    expect(sw.self.clients.claim).toHaveBeenCalledOnce();
  });

  it("still claims clients when unregistering fails", async () => {
    const sw = harness();
    sw.self.registration.unregister.mockRejectedValue(new Error("unregister failed"));
    await expect(sw.lifecycle("activate")).resolves.toBeUndefined();
    expect(sw.self.clients.claim).toHaveBeenCalledOnce();
  });

  it("still unregisters when claiming clients fails", async () => {
    const sw = harness();
    sw.self.clients.claim.mockRejectedValue(new Error("claim failed"));
    await expect(sw.lifecycle("activate")).resolves.toBeUndefined();
    expect(sw.self.registration.unregister).toHaveBeenCalledOnce();
  });
});
