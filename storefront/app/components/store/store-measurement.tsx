import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router";
import type { Locale } from "@/i18n/config";
import { ANALYTICS_CONSENT_KEY, measureStoreEvent, pageEvent, privacyOptOut } from "@/lib/analytics/events";
export function StoreMeasurement({ admin = false, posthogEnabled = false }: { admin?: boolean; posthogEnabled?: boolean; locale?: Locale }) {
  const location = useLocation();
  const last = useRef("");
  useEffect(() => {
    document.documentElement.dataset.storeAdmin = String(admin);
    document.documentElement.dataset.posthogEnabled = String(posthogEnabled);
    if (admin) return;
    const key = location.pathname + location.search;
    if (last.current === key) return;
    last.current = key;
    const event = pageEvent(location.pathname);
    if (event) measureStoreEvent(event);
    if (event === "search" && document.querySelector("[data-search-empty]")) measureStoreEvent("search_empty");
  }, [location.pathname, location.search, admin, posthogEnabled]);
  return null;
}
function consentSnapshot() {
  if (privacyOptOut()) return "blocked";
  try { return localStorage.getItem(ANALYTICS_CONSENT_KEY) === "yes" ? "yes" : "no"; } catch { return "blocked"; }
}
function subscribeConsent(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("gh-analytics-preference", notify);
  return () => { window.removeEventListener("storage", notify); window.removeEventListener("gh-analytics-preference", notify); };
}
export function AnalyticsPreferences({ locale }: { locale: Locale }) {
  const consent = useSyncExternalStore(subscribeConsent, consentSnapshot, () => "no");
  const enabled = consent === "yes";
  const blocked = consent === "blocked";
  const ar = locale === "ar";
  return <details className="mt-4 text-sm text-[var(--ink-soft)]"><summary className="min-h-11 cursor-pointer py-3">{ar ? "تفضيلات التحليلات" : "Analytics preferences"}</summary>
    <p className="max-w-xl leading-7">{ar ? "بموافقتك، نرسل إلى PostHog أحداث تصفح وشراء عامة مع معرّف عشوائي لهذه الجلسة لتحسين المتجر. لا نرسل بيانات النماذج أو كلمات البحث أو معلومات الدفع، ولا نسجل الشاشة. يمكنك إلغاء الموافقة هنا." : "With your permission, we send basic browsing and checkout events to PostHog using a random ID for this session. No form contents, search terms, payment details or screen recordings. You can withdraw permission here."}</p>
    <label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={enabled && !blocked} disabled={blocked} onChange={event => {
      const value = event.target.checked;
      try { localStorage.setItem(ANALYTICS_CONSENT_KEY, value ? "yes" : "no"); if (!value) sessionStorage.removeItem("gh-analytics-session"); window.dispatchEvent(new Event("gh-analytics-preference")); } catch { /* Browser denied storage; no consent is recorded. */ }
    }} />{ar ? "السماح بالتحليلات الاختيارية" : "Allow optional analytics"}</label>
    {blocked ? <p>{ar ? "إعدادات الخصوصية في متصفحك تمنع التتبع." : "Your browser privacy settings prevent tracking."}</p> : null}
  </details>;
}
