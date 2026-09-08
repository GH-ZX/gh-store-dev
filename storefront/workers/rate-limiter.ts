/**
 * Edge Rate Limiting for Cloudflare Workers.
 *
 * Implements a high-performance sliding-window counter in isolate memory.
 * Smooths traffic spikes without hard window reset bursts and prunes expired
 * records to prevent unbounded memory growth.
 *
 * Configures distinct rate tiers for sensitive business operations:
 * - Checkout / purchase mutations (wallet debit, provider fulfillment)
 * - Authentication mutations (login, registration, password resets)
 * - Financial recharges (fiat/crypto top-up submissions)
 * - Search autocomplete queries
 * - Global rapid-fire DDoS / scraper protection
 */

export type RateLimitTier = {
  name: string;
  limit: number;
  windowMs: number;
};

export const TIERS = {
  CHECKOUT: { name: "checkout", limit: 12, windowMs: 60_000 },
  AUTH: { name: "auth", limit: 15, windowMs: 60_000 },
  RECHARGE: { name: "recharge", limit: 15, windowMs: 60_000 },
  SEARCH: { name: "search", limit: 60, windowMs: 60_000 },
  GLOBAL: { name: "global", limit: 300, windowMs: 60_000 },
} as const;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  tier: string;
};

type WindowCount = {
  count: number;
  windowStart: number;
};

type ClientRecord = {
  current: WindowCount;
  previous: WindowCount;
  lastSeen: number;
};

/**
 * In-memory store per tier.
 * Map<`${tier}:${ip}`, ClientRecord>
 */
class SlidingWindowStore {
  private records = new Map<string, ClientRecord>();
  private lastPrune = Date.now();

  check(
    key: string,
    tier: RateLimitTier,
    now: number = Date.now(),
  ): RateLimitResult {
    // Prune stale records every 2 minutes
    if (now - this.lastPrune > 120_000) {
      this.prune(now);
    }

    const { limit, windowMs } = tier;
    const currentWindowStart = Math.floor(now / windowMs) * windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = {
        current: { count: 1, windowStart: currentWindowStart },
        previous: { count: 0, windowStart: currentWindowStart - windowMs },
        lastSeen: now,
      };
      this.records.set(key, record);
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetSeconds: Math.ceil((currentWindowStart + windowMs - now) / 1000),
        tier: tier.name,
      };
    }

    record.lastSeen = now;

    // Advance windows if time progressed
    if (record.current.windowStart === currentWindowStart) {
      // Still in same window
    } else if (record.current.windowStart === currentWindowStart - windowMs) {
      // Advanced by 1 window
      record.previous = record.current;
      record.current = { count: 0, windowStart: currentWindowStart };
    } else {
      // Advanced by 2+ windows, reset completely
      record.previous = { count: 0, windowStart: currentWindowStart - windowMs };
      record.current = { count: 0, windowStart: currentWindowStart };
    }

    // Calculate sliding window weight
    const timeIntoCurrentWindow = now - currentWindowStart;
    const previousWeight = Math.max(0, (windowMs - timeIntoCurrentWindow) / windowMs);
    const estimatedCount =
      Math.floor(record.previous.count * previousWeight) + record.current.count;

    if (estimatedCount >= limit) {
      const resetSeconds = Math.ceil((currentWindowStart + windowMs - now) / 1000);
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetSeconds: Math.max(1, resetSeconds),
        tier: tier.name,
      };
    }

    // Increment count
    record.current.count += 1;
    const remaining = Math.max(0, limit - estimatedCount - 1);
    const resetSeconds = Math.ceil((currentWindowStart + windowMs - now) / 1000);

    return {
      allowed: true,
      limit,
      remaining,
      resetSeconds: Math.max(1, resetSeconds),
      tier: tier.name,
    };
  }

  private prune(now: number): void {
    this.lastPrune = now;
    const maxAge = 5 * 60_000; // 5 minutes
    for (const [key, record] of this.records.entries()) {
      if (now - record.lastSeen > maxAge) {
        this.records.delete(key);
      }
    }
  }

  clear(): void {
    this.records.clear();
  }
}

export const rateLimitStore = new SlidingWindowStore();

/**
 * Extracts the best candidate client IP from headers.
 */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "127.0.0.1";
}

/**
 * Matches a request against rate limiting tiers based on sensitivity.
 */
export function resolveRateLimitTier(request: Request): RateLimitTier {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // 1. Checkout / Order Purchase mutations
  if (method === "POST" && /^\/(?:ar|en)\/checkout\//.test(path)) {
    return TIERS.CHECKOUT;
  }

  // 2. Authentication sensitive POST endpoints
  if (
    method === "POST" &&
    /^\/(?:ar|en)\/(?:login|forgot-password|reset-password)(?:\/|$)/.test(path)
  ) {
    return TIERS.AUTH;
  }

  // 3. Recharge submissions
  if (method === "POST" && /^\/(?:ar|en)\/recharge(?:\/|$)/.test(path)) {
    return TIERS.RECHARGE;
  }

  // 4. Autocomplete search requests
  if (path === "/api/search/suggest") {
    return TIERS.SEARCH;
  }

  // 5. Global baseline protection
  return TIERS.GLOBAL;
}

/**
 * Performs rate limit check on an incoming request.
 */
export function checkRateLimit(
  request: Request,
  now: number = Date.now(),
): RateLimitResult {
  const tier = resolveRateLimitTier(request);
  const ip = getClientIp(request);
  const key = `${tier.name}:${ip}`;

  return rateLimitStore.check(key, tier, now);
}

/**
 * Constructs a standardized HTTP 429 Too Many Requests response.
 */
export function buildRateLimitResponse(
  request: Request,
  result: RateLimitResult,
): Response {
  const acceptsHtml =
    request.headers.get("accept")?.includes("text/html") &&
    !request.headers.get("accept")?.includes("application/json");

  const headers = new Headers({
    "Retry-After": String(result.resetSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": "0",
    "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + result.resetSeconds),
    "X-RateLimit-Tier": result.tier,
    "Cache-Control": "private, no-store, no-cache",
  });

  if (!acceptsHtml) {
    headers.set("Content-Type", "application/json; charset=utf-8");
    const payload = JSON.stringify({
      error: "too_many_requests",
      message: `Rate limit exceeded. Please retry after ${result.resetSeconds} seconds.`,
      retryAfterSeconds: result.resetSeconds,
      tier: result.tier,
    });
    return new Response(payload, { status: 429, headers });
  }

  headers.set("Content-Type", "text/html; charset=utf-8");
  const isArabic = new URL(request.url).pathname.startsWith("/ar");

  const html = `<!DOCTYPE html>
<html lang="${isArabic ? "ar" : "en"}" dir="${isArabic ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${isArabic ? "طلبات كثيرة جداً — متجر GH" : "Too Many Requests — GH Store"}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #101218;
      color: #f3f4fa;
      padding: 1.5rem;
      text-align: center;
    }
    .card {
      max-width: 28rem;
      border: 1px solid #2a2e3a;
      background: #191c25;
      padding: 2rem;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    h1 { font-size: 1.35rem; margin: 0 0 0.75rem; font-weight: 700; color: #efc16c; }
    p { font-size: 0.9rem; line-height: 1.6; color: #c8cdd9; margin: 0 0 1.5rem; }
    .countdown { font-family: monospace; font-size: 1.1rem; font-weight: 700; color: #5354ee; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${isArabic ? "تم تجاوز حد الطلبات" : "Too Many Requests"}</h1>
    <p>
      ${
        isArabic
          ? "أرسلت طلبات كثيرة في وقت قصير. يرجى الانتظار قليلاً ثم إعادة المحاولة."
          : "You have made too many requests in a short period. Please wait a moment before trying again."
      }
    </p>
    <div class="countdown">${result.resetSeconds}s</div>
  </div>
</body>
</html>`;

  return new Response(html, { status: 429, headers });
}
