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
  [
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' https://plausible.io https://challenges.cloudflare.com",
      "frame-src 'self' https://challenges.cloudflare.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://plausible.io https://challenges.cloudflare.com",
      "manifest-src 'self'",
      "worker-src 'self'",
      "report-uri /api/csp-report",
      "report-to csp-endpoint",
    ].join("; "),
  ],
  [
    "Content-Security-Policy-Report-Only",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' https://plausible.io https://challenges.cloudflare.com",
      "frame-src 'self' https://challenges.cloudflare.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://plausible.io https://challenges.cloudflare.com",
      "manifest-src 'self'",
      "worker-src 'self'",
      "report-uri /api/csp-report",
      "report-to csp-endpoint",
    ].join("; "),
  ],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Reporting-Endpoints", 'csp-endpoint="/api/csp-report"'],
];

export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of SECURITY_HEADERS) {
    headers.set(key, value);
  }
}

export const EARLY_HINT_PRELOADS: string = [
  "<https://fonts.googleapis.com>; rel=preconnect; crossorigin",
  "<https://fonts.gstatic.com>; rel=preconnect; crossorigin",
  "</gh-store-logo-mark.png>; rel=preload; as=image",
].join(", ");

export function applyEarlyHintHeaders(headers: Headers): void {
  headers.set("Link", EARLY_HINT_PRELOADS);
}
