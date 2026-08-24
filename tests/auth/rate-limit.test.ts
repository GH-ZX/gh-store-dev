import { describe, expect, it } from "vitest";
import { strongPasswordSchema } from "@/lib/auth/password-policy";
import { createLoginRateLimiter } from "@/lib/auth/rate-limit";

describe("login rate limiter", () => {
  it("allows attempts until the failure threshold", () => {
    const limiter = createLoginRateLimiter();

    for (let i = 0; i < 4; i += 1) {
      limiter.recordFailure("ip-a");
      expect(limiter.isBlocked("ip-a")).toBe(false);
    }

    limiter.recordFailure("ip-a");
    expect(limiter.isBlocked("ip-a")).toBe(true);
  });

  it("releases a key after the base block elapses", () => {
    let now = 0;
    const limiter = createLoginRateLimiter(() => now);

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure("acct-b");
    }

    expect(limiter.isBlocked("acct-b")).toBe(true);

    now += 60_000;
    expect(limiter.isBlocked("acct-b")).toBe(false);
  });

  it("escalates every failure observed during a block", () => {
    let now = 0;
    const limiter = createLoginRateLimiter(() => now);

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure("ip-c");
    }

    // Blocked until t=60s. A failure at t=30s doubles the 30s that remain.
    now = 30_000;
    limiter.recordFailure("ip-c");

    // Blocked until t=90s...
    now = 80_000;
    expect(limiter.isBlocked("ip-c")).toBe(true);

    // ...and a failure there doubles the 10s that remain, to t=100s.
    limiter.recordFailure("ip-c");
    now = 95_000;
    expect(limiter.isBlocked("ip-c")).toBe(true);
    now = 101_000;
    expect(limiter.isBlocked("ip-c")).toBe(false);
  });

  it("caps escalation at fifteen minutes", () => {
    let now = 0;
    const limiter = createLoginRateLimiter(() => now);

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure("ip-d");
    }

    let minutes = 0;

    while (limiter.isBlocked("ip-d") && minutes < 100) {
      limiter.recordFailure("ip-d");

      if (!limiter.isBlocked("ip-d")) {
        break;
      }
      now += 15 * 60_000;
      minutes += 15;
    }

    expect(minutes).toBeLessThanOrEqual(20);
    expect(limiter.isBlocked("ip-d")).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createLoginRateLimiter();

    for (let i = 0; i < 5; i += 1) {
      limiter.recordFailure("acct-one");
    }

    expect(limiter.isBlocked("acct-one")).toBe(true);
    expect(limiter.isBlocked("acct-two")).toBe(false);
  });

  it("clears history after a success", () => {
    const limiter = createLoginRateLimiter();

    for (let i = 0; i < 4; i += 1) {
      limiter.recordFailure("acct-three");
    }

    limiter.clear("acct-three");
    expect(limiter.isBlocked("acct-three")).toBe(false);

    for (let i = 0; i < 4; i += 1) {
      limiter.recordFailure("acct-three");
    }

    expect(limiter.isBlocked("acct-three")).toBe(false);
  });
});

describe("strong password policy", () => {
  it.each([
    ["Short1a"],
    ["nodigitshere"],
    ["12345678"],
  ])("rejects %j", (password) => {
    expect(strongPasswordSchema.safeParse(password).success).toBe(false);
  });

  it.each([
    ["abcd1234"],
    ["ALLUPPERCASE123"],
    ["Tr0ub4dor&Long"],
  ])("accepts %j", (password) => {
    expect(strongPasswordSchema.safeParse(password).success).toBe(true);
  });
});
