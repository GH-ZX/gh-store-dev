export const STORE_EVENTS = ["catalog_view", "product_view", "checkout_view", "search", "search_empty", "recharge_view", "quick_buy"] as const;
export type StoreEvent = typeof STORE_EVENTS[number];
export const ANALYTICS_CONSENT_KEY = "gh-analytics-consent-v1";
export function privacyOptOut() {
  return navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
export function measureStoreEvent(event: StoreEvent) {
  if (typeof window === "undefined" || privacyOptOut() || document.documentElement.dataset.storeAdmin === "true") return;
  let sessionId: string | undefined;
  try {
    if (document.documentElement.dataset.posthogEnabled === "true" && localStorage.getItem(ANALYTICS_CONSENT_KEY) === "yes") {
      sessionId = sessionStorage.getItem("gh-analytics-session") ?? crypto.randomUUID();
      sessionStorage.setItem("gh-analytics-session", sessionId);
    }
  } catch { /* Restricted storage still permits aggregate counters. */ }
  const payload = sessionId ? JSON.stringify({ event, sessionId, consent: true }) : event;
  navigator.sendBeacon?.("/api/store-event", payload);
}
/** URLs and search strings never enter the analytics payload. */
export function pageEvent(pathname: string): StoreEvent | null {
  const parts = pathname.split("/").filter(Boolean).slice(1);
  const first = parts[0];
  if (["login", "forgot-password", "reset-password", "profile", "orders", "support", "dashboard", "notifications", "auth"].includes(first)) return null;
  if (first === "checkout" && parts.length === 3) return "checkout_view";
  if (first === "search") return "search";
  if (first === "recharge") return "recharge_view";
  if (parts.length === 2 || parts.length === 3) return "product_view";
  if (!first || ["products", "games", "gift-cards", "gift-cards-codes", "games-vouchers", "games-instant-recharge", "design", "ai", "productivity", "services", "sale", "best-sellers"].includes(first)) return "catalog_view";
  return null;
}
