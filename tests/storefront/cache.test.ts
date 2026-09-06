import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearCache } from "@server/lib/cache";
import { revalidatePath, revalidateTag } from "@server/compat/cache";

beforeEach(() => { clearCache(); });
afterEach(() => { vi.useRealTimers(); });

describe("public service cache", () => {
  it("shares an in-flight read while returning independent objects to each request", async () => {
    let resolve!: (value: { offers: { price: number }[] }) => void;
    const load = vi.fn(() => new Promise<{ offers: { price: number }[] }>((done) => { resolve = done; }));
    const first = cached("catalog", 1000, load);
    const second = cached("catalog", 1000, load);
    resolve({ offers: [{ price: 12 }] });
    const [firstValue, secondValue] = await Promise.all([first, second]);
    firstValue.offers[0].price = 999;
    expect(secondValue.offers[0].price).toBe(12);
    expect((await cached("catalog", 1000, load)).offers[0].price).toBe(12);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refreshes expired data and retains distinct cache keys", async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce({ value: 1 }).mockResolvedValueOnce({ value: 2 });
    await expect(cached("settings", 1000, load)).resolves.toEqual({ value: 1 });
    await expect(cached("other-settings", 1000, async () => ({ value: 8 }))).resolves.toEqual({ value: 8 });
    vi.advanceTimersByTime(999);
    await expect(cached("settings", 1000, load)).resolves.toEqual({ value: 1 });
    vi.advanceTimersByTime(1);
    await expect(cached("settings", 1000, load)).resolves.toEqual({ value: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([revalidatePath, revalidateTag])("invalidates service snapshots after a mutation (%#)", async (invalidate) => {
    const load = vi.fn().mockResolvedValueOnce({ title: "Before" }).mockResolvedValueOnce({ title: "After" });
    await cached("settings", 60_000, load);
    invalidate("/en");
    await expect(cached("settings", 60_000, load)).resolves.toEqual({ title: "After" });
  });

  it("does not revive a stale in-flight read after invalidation", async () => {
    let resolve!: (value: string) => void;
    const oldRead = cached("catalog", 60_000, () => new Promise<string>((done) => { resolve = done; }));
    revalidatePath("/en/products");
    await expect(cached("catalog", 60_000, async () => "new")).resolves.toBe("new");
    resolve("old");
    await expect(oldRead).resolves.toBe("old");
    await expect(cached("catalog", 60_000, async () => "unexpected")).resolves.toBe("new");
  });

  it("allows retry after a failed upstream read", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("upstream unavailable")).mockResolvedValueOnce(["restored"]);
    await expect(cached("catalog", 1000, load)).rejects.toThrow("upstream unavailable");
    await expect(cached("catalog", 1000, load)).resolves.toEqual(["restored"]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
