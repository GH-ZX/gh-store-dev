import type { StoreEvent } from "@/lib/analytics/events";
/** Explicit anonymous events only. Never forward request headers, URL or client IP. */
export async function capturePosthog(env: Record<string, string | undefined>, event: StoreEvent, sessionId: string) {
  if (!env.POSTHOG_PROJECT_KEY || !["US", "EU"].includes(env.POSTHOG_REGION ?? "")) return;
  const host = env.POSTHOG_REGION === "EU" ? "https://eu.i.posthog.com" : "https://us.i.posthog.com";
  try {
    const result = await fetch(`${host}/i/v0/e/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: env.POSTHOG_PROJECT_KEY, event: `store_${event}`, distinct_id: sessionId,
        properties: { $process_person_profile: false, $geoip_disable: true, $ip: null, source: "gh-store" } }),
      signal: AbortSignal.timeout(3000),
    });
    if (!result.ok) console.warn("PostHog event unavailable", { status: result.status });
    await result.body?.cancel();
  } catch { console.warn("PostHog event unavailable"); }
}
