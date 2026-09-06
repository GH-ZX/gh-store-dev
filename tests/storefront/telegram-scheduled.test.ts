import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSweepHeartbeat, runTelegramScheduled, sweepStallState } from "../../storefront/workers/telegram-bot";

const env = { SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" };
const settings = [{ telegram: { telegram: { enabled: true, bot_token: "test-token", chat_id: "100" } } }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("migrated scheduled Telegram delivery", () => {
  it("drains owner and customer alerts to their respective chats and marks sent only on successful delivery", async () => {
    const messages: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("store_settings?")) return Response.json(settings);
      if (url.includes("telegram_alerts?status=")) return Response.json([
        { id: "owner-alert", type: "order_placed", payload: { order_number: "GH-1", total: 5 }, user_id: null },
        { id: "customer-alert", type: "order_delivered", payload: { order_id: "order-1", order_number: "GH-1" }, user_id: "customer-1" },
      ]);
      if (url.includes("telegram_chat_links?")) return Response.json([{ chat_id: "200", language_code: "ar" }]);
      if (url.startsWith("https://api.telegram.org/")) {
        const message = JSON.parse(String(init?.body));
        messages.push(message);
        return Response.json({ ok: message.chat_id === "100" });
      }
      if (init?.method === "PATCH") {
        updates.push({ url, ...JSON.parse(String(init.body)) });
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected mocked URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await runTelegramScheduled(env);

    expect(messages).toHaveLength(2);
    expect(messages[0].chat_id).toBe("100");
    expect(messages[1]).toMatchObject({ chat_id: "200", text: expect.stringContaining("تم تنفيذ طلبك") });
    expect(updates[0]).toMatchObject({ status: "sent", sent_at: expect.any(String) });
    expect(updates[1]).toMatchObject({ status: "failed" });
    expect(updates[1]).not.toHaveProperty("sent_at");
  });

  it("honors the disabled setting without reading or delivering the queue", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ telegram: { enabled: false } }]));
    vi.stubGlobal("fetch", fetchMock);
    await runTelegramScheduled(env);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("queues a deduplicated alert when the sweep misses four ticks", async () => {
    const now = Date.parse("2026-09-06T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      if (input.includes("store_settings?")) return Response.json(settings);
      if (input.includes("sweep_heartbeats?")) return Response.json([{ last_success_at: "2026-09-06T11:30:00Z", last_failure_at: null, last_error: null }]);
      if (init?.method === "POST") {
        writes.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected mocked URL: ${input}`);
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await checkSweepHeartbeat(env);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ type: "sweep_stalled", status: "pending", dedup_key: expect.stringMatching(/^sweep_stalled:/), payload: { minutes_since: 30 } });
  });

  it("treats missing and corrupt heartbeats as stalled while accepting recent successes", () => {
    const now = Date.parse("2026-09-06T12:00:00Z");
    expect(sweepStallState(now, null)).toMatchObject({ stalled: true, everRan: false });
    expect(sweepStallState(now, { last_success_at: "invalid", last_failure_at: null, last_error: null }).stalled).toBe(true);
    expect(sweepStallState(now, { last_success_at: "2026-09-06T11:50:00Z", last_failure_at: null, last_error: null }).stalled).toBe(false);
  });
});
