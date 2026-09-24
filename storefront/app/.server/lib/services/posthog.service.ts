import { getPosthogSettings } from "@server/lib/services/experience-settings.service";
import type { StoreEvent } from "@/lib/analytics/events";
/** Explicit anonymous events only. Never forward request headers, URL or client IP. */
export async function capturePosthog(event: StoreEvent, sessionId: string) {
  try {
    const settings = await getPosthogSettings();
    if (!settings.enabled) return;
    const host = settings.region === "EU" ? "https://eu.i.posthog.com" : "https://us.i.posthog.com";
    const result = await fetch(`${host}/i/v0/e/`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: settings.project_key, event: `store_${event}`, distinct_id: sessionId,
        properties: { $process_person_profile: false, $geoip_disable: true, $ip: null, source: "gh-store" } }),
      signal: AbortSignal.timeout(3000),
    });
    if (!result.ok) console.warn("PostHog event unavailable", { status: result.status });
    await result.body?.cancel();
  } catch { console.warn("PostHog event unavailable"); }
}
