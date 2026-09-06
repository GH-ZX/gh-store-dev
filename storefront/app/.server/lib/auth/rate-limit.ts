/**
 * Login attempt throttling.
 *
 * Tracks failures per IP and per account independently; a guesser working one
 * account from many addresses hits the account counter, and a spray across
 * many accounts from one address hits the IP counter. After
 * MAX_FAILURES_BEFORE_BLOCK consecutive failures the key is blocked for a
 * minute, and every failure observed while blocked doubles the remaining
 * block up to a 15 minute ceiling — long enough to make online brute force
 * pointless, short enough that a locked-out customer recovers without support.
 *
 * The store lives in module memory. On Cloudflare Workers each isolate holds
 * its own copy, so the effective limit multiplies by the isolate count; that
 * still throttles unauthenticated guessing massively at zero infrastructure
 * cost. If it ever needs to be exact, swap this file for a KV or Durable
 * Object implementation behind the same functions.
 *
 * Keys are data, not identifiers to log: the email side is stored hashed so a
 * memory dump does not hand over the customer list.
 */
const MAX_FAILURES_BEFORE_BLOCK = 5;
const BASE_BLOCK_MS = 60_000;
const MAX_BLOCK_MS = 15 * 60_000;

type AttemptRecord = {
  failures: number;
  /** Zero means accumulating failures, not currently blocked. */
  blockedUntil: number;
};

export type LoginRateLimiter = {
  /** True when the key is currently blocked from attempting sign-in. */
  isBlocked(key: string): boolean;
  /** Record a failed attempt against the key, possibly starting or extending a block. */
  recordFailure(key: string): void;
  /** Clear the key's history after a successful sign-in. */
  clear(key: string): void;
};

export function createLoginRateLimiter(now: () => number = Date.now): LoginRateLimiter {
  const records = new Map<string, AttemptRecord>();

  function sweep(): void {
    if (records.size < 10_000) {
      return;
    }

    const timestamp = now();

    for (const [key, record] of records) {
      if (record.blockedUntil <= timestamp && record.failures < MAX_FAILURES_BEFORE_BLOCK) {
        records.delete(key);
      }
    }
  }

  return {
    isBlocked(key) {
      const record = records.get(key);

      return record !== undefined && record.blockedUntil > now();
    },

    recordFailure(key) {
      sweep();

      const timestamp = now();
      const existing = records.get(key);
      const isCurrentlyBlocked =
        existing !== undefined && existing.blockedUntil > timestamp;
      const failures = (existing?.failures ?? 0) + 1;

      if (isCurrentlyBlocked) {
        /*
         * Keep guessing while blocked and the clock stretches: one minute,
         * then two, four, eight, capped at fifteen. The counter keeps rising
         * with it, so a patient attacker never sees the ceiling reset.
         */
        const remaining = existing.blockedUntil - timestamp;

        records.set(key, {
          failures,
          blockedUntil: timestamp + Math.min(remaining * 2, MAX_BLOCK_MS),
        });

        return;
      }

      if (failures >= MAX_FAILURES_BEFORE_BLOCK) {
        records.set(key, { failures, blockedUntil: timestamp + BASE_BLOCK_MS });

        return;
      }

      records.set(key, { failures, blockedUntil: 0 });
    },

    clear(key) {
      records.delete(key);
    },
  };
}

/*
 * One process-wide limiter per concern. Two keys are written per failure —
 * one under the request IP, one under the hashed email — and both are checked
 * before any credential check runs.
 */
const ipLimiter = createLoginRateLimiter();
const accountLimiter = createLoginRateLimiter();

export function isLoginBlockedForIp(ip: string): boolean {
  return ipLimiter.isBlocked(ip);
}

export function isLoginBlockedForAccount(emailHash: string): boolean {
  return accountLimiter.isBlocked(emailHash);
}

export function recordFailedLoginAttempt(ip: string, emailHash: string): void {
  ipLimiter.recordFailure(ip);
  accountLimiter.recordFailure(emailHash);
}

export function clearLoginFailures(ip: string, emailHash: string): void {
  ipLimiter.clear(ip);
  accountLimiter.clear(emailHash);
}
