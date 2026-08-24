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
];

export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of SECURITY_HEADERS) {
    headers.set(key, value);
  }
}
