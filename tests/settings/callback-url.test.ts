import { describe, expect, it } from "vitest";
import { checkCallbackUrl, isCallbackReachable } from "@/lib/settings/callback-url";

describe("callback URL reachability", () => {
  it("accepts a public https address", () => {
    expect(checkCallbackUrl("https://ghstore.example/api/webhooks/sam")).toBe("ok");
    expect(isCallbackReachable("https://ghstore.example/api/webhooks/sam")).toBe(true);
  });

  it("rejects the developer's own machine, which a provider can never call", () => {
    for (const url of [
      "http://localhost:3000/api/webhooks/sam",
      "https://localhost:3000/api/webhooks/sam",
      "http://127.0.0.1:3000/api/webhooks/sam",
      "http://[::1]:3000/api/webhooks/sam",
      "http://0.0.0.0:3000/api/webhooks/sam",
      "http://gh.local/api/webhooks/sam",
    ]) {
      expect(checkCallbackUrl(url)).toBe("local");
    }
  });

  it("rejects a private network address", () => {
    expect(checkCallbackUrl("https://192.168.1.10/api/webhooks/sam")).toBe("local");
    expect(checkCallbackUrl("https://10.0.0.4/api/webhooks/sam")).toBe("local");
    expect(checkCallbackUrl("https://172.16.0.9/api/webhooks/sam")).toBe("local");
  });

  it("does not mistake a public address for a private one", () => {
    // 172.32 is outside the private 172.16–172.31 range, and 100.x is public.
    expect(checkCallbackUrl("https://172.32.0.1/api/webhooks/sam")).toBe("ok");
    expect(checkCallbackUrl("https://100.20.30.40/api/webhooks/sam")).toBe("ok");
  });

  it("rejects plain http, because the callback carries a secret", () => {
    expect(checkCallbackUrl("http://ghstore.example/api/webhooks/sam")).toBe("insecure");
    expect(isCallbackReachable("http://ghstore.example/api/webhooks/sam")).toBe(false);
  });

  it("reports an unparseable address rather than throwing", () => {
    expect(checkCallbackUrl("not a url")).toBe("invalid");
    expect(checkCallbackUrl("")).toBe("invalid");
  });
});
