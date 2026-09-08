/**
 * Security response headers applied to every response.
 *
 * `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'` keep authenticated
 * state-changing pages (profile, wallet, checkout, support, orders) out of
 * third-party iframes, which closes the clickjacking route. Modern browsers
 * prefer the CSP directive; X-Frame-Options stays for older ones.
 *
 * HSTS, nosniff, and a referrer policy ride along as defense-in-depth. A full
 * content CSP needs nonce plumbing through every rendered document and is
 * deliberately not attempted here; `frame-ancestors` alone is valid CSP and
 * breaks nothing.
 *
 * Applied in two places on purpose: `next.config.ts` covers routes this
 * middleware never sees (`api`, `auth/callback`, static assets), while
 * `src/middleware.ts` covers its own redirect responses, which bypass config
 * headers entirely. Both write identical values with set semantics, so they
 * never duplicate.
 */
export const SECURITY_HEADERS: ReadonlyArray<readonly [key: string, value: string]> = [
  ["X-Frame-Options", "DENY"],
  ["Content-Security-Policy", "frame-ancestors 'none'"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  /**
   * A full content-security policy, observed but not enforced.
   *
   * The enforced CSP above stays `frame-ancestors` alone; this header writes
   * the rest of the policy we intend to enforce one day and asks browsers to
   * report what it would have blocked instead of blocking it. Running it from
   * launch — before, not after, the tightening — means a week of real traffic
   * produces the actual host list: every script, image origin, and websocket
   * the storefront really uses, rather than the list a reading of the code
   * would guess. The reports land in `/api/csp-report` and flow into the same
   * log as everything else, so enabling enforcement later is a decision made
   * on evidence instead of a hopeful guess that breaks checkout.
   *
   * The gaps this deliberately tolerates: `'unsafe-inline'` for scripts and
   * styles — the pre-paint theme script and the owner's accent `<style>` are
   * inline by design, and nonce plumbing through every document is a change
   * with its own risk budget — and `img-src https:` for the supplier artwork
   * hosts, which the reports will enumerate so the enforcement candidate can
   * name them. Nothing here loosens what ships today: report-only changes no
   * behavior at all, it only adds a header.
   *
   * `report-to` is the modern channel and needs the `Reporting-Endpoints`
   * header beside it; `report-uri` is the legacy one, kept because browsers
   * without `report-to` still speak it. Both name the same endpoint.
   */
  [
    "Content-Security-Policy-Report-Only",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' https://plausible.io",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://plausible.io",
      "manifest-src 'self'",
      "worker-src 'self'",
      "report-uri /api/csp-report",
      "report-to csp-endpoint",
    ].join("; "),
  ],
  ["Reporting-Endpoints", 'csp-endpoint="/api/csp-report"'],
];

export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of SECURITY_HEADERS) {
    headers.set(key, value);
  }
}
