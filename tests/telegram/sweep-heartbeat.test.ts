import { describe, expect, it } from "vitest";
import { sweepStallState } from "../../worker/telegram-bot";

describe("sweepStallState", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");
  const heartbeat = {
    last_success_at: "2026-08-27T11:50:00.000Z",
    last_failure_at: null,
    last_error: null,
  };

  it("is healthy within the threshold", () => {
    const state = sweepStallState(now, heartbeat);

    expect(state.stalled).toBe(false);
    expect(state.everRan).toBe(true);
    expect(state.minutesSince).toBe(10);
  });

  it("is stalled past four missed ticks", () => {
    const state = sweepStallState(now, {
      ...heartbeat,
      last_success_at: "2026-08-27T11:30:00.000Z",
    });

    expect(state.stalled).toBe(true);
    expect(state.minutesSince).toBe(30);
  });

  it("treats a heartbeat that never succeeded as a stall", () => {
    const state = sweepStallState(now, {
      last_success_at: null,
      last_failure_at: "2026-08-27T11:00:00.000Z",
      last_error: "reconciliation_failed",
    });

    expect(state.stalled).toBe(true);
    expect(state.everRan).toBe(false);
    expect(state.minutesSince).toBeNull();
  });

  it("treats a missing row as a stall", () => {
    const state = sweepStallState(now, null);

    expect(state.stalled).toBe(true);
    expect(state.everRan).toBe(false);
  });

  it("treats an unparseable stamp as a stall", () => {
    const state = sweepStallState(now, { ...heartbeat, last_success_at: "not-a-date" });

    expect(state.stalled).toBe(true);
    expect(state.everRan).toBe(true);
    expect(state.minutesSince).toBeNull();
  });

  it("honours a custom threshold", () => {
    const state = sweepStallState(now, heartbeat, 5 * 60_000);

    expect(state.stalled).toBe(true);
  });
});
