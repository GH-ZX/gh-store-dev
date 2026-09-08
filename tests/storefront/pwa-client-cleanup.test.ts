import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const root = readFileSync(new URL("../../storefront/app/root.tsx", import.meta.url), "utf8");
const script = root.match(/__html: `(if\("serviceWorker" in navigator\)[^`]+)`/)?.[1];
if (!script) throw new Error("Missing service-worker retirement script");
const origin = "https://gh-store.example";

function registration(scriptURL: string, state = "active") {
  return { [state]: { scriptURL }, unregister: vi.fn(async () => true) };
}

describe("client service-worker retirement", () => {
  it("retires only this store's active, waiting or installing worker", async () => {
    const own = ["active", "waiting", "installing"].map((state) => registration(`${origin}/sw.js`, state));
    const unrelated = [registration(`${origin}/notifications-worker.js`), registration("https://other.example/sw.js")];
    await runInNewContext(script, {
      navigator: { serviceWorker: { getRegistrations: async () => [...own, ...unrelated] } },
      location: { origin },
    });
    own.forEach((item) => expect(item.unregister).toHaveBeenCalledOnce());
    unrelated.forEach((item) => expect(item.unregister).not.toHaveBeenCalled());
  });

  it("tolerates registration lookup failures", async () => {
    await expect(runInNewContext(script, {
      navigator: { serviceWorker: { getRegistrations: async () => { throw new Error("Unavailable"); } } },
      location: { origin },
    })).resolves.toBeUndefined();
  });

  it("handles an unregister rejection without interrupting other cleanup", async () => {
    const first = registration(`${origin}/sw.js`);
    first.unregister.mockRejectedValue(new Error("Unavailable"));
    const second = registration(`${origin}/sw.js`, "waiting");
    await expect(runInNewContext(script, {
      navigator: { serviceWorker: { getRegistrations: async () => [first, second] } },
      location: { origin },
    })).resolves.toBeUndefined();
    expect(second.unregister).toHaveBeenCalledOnce();
  });

  it("does nothing when service workers are unsupported", () => {
    expect(runInNewContext(script, { navigator: {} })).toBeUndefined();
  });
});
