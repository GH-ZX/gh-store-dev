import type { Locale } from "@/i18n/config";
import { safeRedirectTarget } from "@server/lib/auth/redirect-target";

/** Recharge links may resume a checkout in this locale, never an arbitrary redirect. */
export function checkoutReturnTo(value: unknown, locale: Locale): string | null {
  const target = safeRedirectTarget(value);
  if (!target) return null;
  const { pathname } = new URL(target, "https://gh-store.internal");
  const segments = pathname.split("/");
  if (segments.length !== 5 || segments[1] !== locale || segments[2] !== "checkout") return null;
  if (segments.slice(3).some((segment) => !segment || /[/?#\\]/.test(decodeURIComponent(segment)))) return null;
  return pathname;
}

/** Binance V3 permits at most one query parameter and 256 characters per return URL. */
export function binanceReturnUrl(siteUrl: string, path: string, returnTo: string | null): string {
  const base = new URL(path, siteUrl);
  if (!/^https?:$/.test(base.protocol) || base.href.length > 256) {
    throw new Error("Invalid Binance return URL configuration.");
  }
  if (!returnTo) return base.href;
  const contextual = new URL(base);
  contextual.searchParams.set("returnTo", returnTo);
  // Keep the original store tab's context when Binance cannot carry a long path.
  return contextual.href.length <= 256 ? contextual.href : base.href;
}
