import { afterEach, describe, expect, it, vi } from "vitest";
import { pageEvent } from "@/lib/analytics/events";
import { capturePosthog } from "@server/lib/services/posthog.service";
const settings = vi.hoisted(() => vi.fn());
vi.mock("@server/lib/services/experience-settings.service", () => ({ getPosthogSettings: settings }));
afterEach(() => { vi.unstubAllGlobals(); settings.mockReset(); });
describe("store analytics boundaries", () => {
  it("ignores private account routes and reports generic checkout events", () => {
    for (const path of ["/ar/login", "/en/orders/order-secret", "/en/reset-password", "/ar/support/ticket-secret", "/ar/dashboard/catalog"]) expect(pageEvent(path)).toBeNull();
    expect(pageEvent("/ar/checkout/product/package")).toBe("checkout_view");
    expect(pageEvent("/ar/ai/product")).toBe("product_view");
  });
  it("stays disabled without a project and a supported region", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    settings.mockResolvedValueOnce({ enabled: false }).mockRejectedValueOnce(new Error("unavailable"));
    await capturePosthog("catalog_view", "session");
    await capturePosthog("catalog_view", "session");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only allowlisted event properties without IP, URL or profile creation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 })); vi.stubGlobal("fetch", fetcher);
    settings.mockResolvedValue({ enabled: true, project_key: "test", region: "EU" });
    await capturePosthog("quick_buy", "anonymous-session");
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect(JSON.parse(request.body)).toEqual({ api_key: "test", event: "store_quick_buy", distinct_id: "anonymous-session", properties: { $process_person_profile: false, $geoip_disable: true, $ip: null, source: "gh-store" } });
  });
});
