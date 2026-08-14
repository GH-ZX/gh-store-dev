import { describe, expect, it } from "vitest";
import { hashEmail, redact, REDACTED } from "@/lib/logging/redact";

describe("redaction", () => {
  it("removes anything whose name suggests a credential", () => {
    const out = redact({
      api_key: "sk_live_abcdef",
      apiKey: "sk_live_abcdef",
      webhook_secret: "s3cret",
      Authorization: "Bearer xyz",
      password: "hunter2",
      signature: "abc",
      orderNumber: "GH-2026-0001",
    }) as Record<string, unknown>;

    expect(out.api_key).toBe(REDACTED);
    expect(out.apiKey).toBe(REDACTED);
    expect(out.webhook_secret).toBe(REDACTED);
    expect(out.Authorization).toBe(REDACTED);
    expect(out.password).toBe(REDACTED);
    expect(out.signature).toBe(REDACTED);
    // Not a secret, and the whole point of the log.
    expect(out.orderNumber).toBe("GH-2026-0001");
  });

  it("redacts at every depth, not just the top level", () => {
    const out = redact({
      provider: { sam: { api_key: "sk_live", enabled: true } },
    }) as { provider: { sam: Record<string, unknown> } };

    expect(out.provider.sam.api_key).toBe(REDACTED);
    expect(out.provider.sam.enabled).toBe(true);
  });

  it("shortens a wallet address to something recognisable but unusable", () => {
    const address = "be1f2c3d4e5f60718293a4b5c6d7e8d0";
    const out = redact({ identifier: address }) as { identifier: string };

    expect(out.identifier).not.toBe(address);
    expect(out.identifier).toContain("…");
    expect(out.identifier.length).toBeLessThan(address.length);
  });

  it("shortens a long id embedded in a sentence", () => {
    const out = redact("paid into be1f2c3d4e5f60718293a4b5c6d7e8d0 today") as string;

    expect(out).not.toContain("be1f2c3d4e5f60718293a4b5c6d7e8d0");
    expect(out).toContain("paid into");
  });

  it("leaves ordinary values alone", () => {
    expect(redact({ amount: 12.5, currency: "USD", ok: false, missing: null })).toEqual({
      amount: 12.5,
      currency: "USD",
      ok: false,
      missing: null,
    });
  });

  it("caps depth and array length so a bad payload cannot hang the logger", () => {
    let deep: Record<string, unknown> = { value: "bottom" };
    for (let i = 0; i < 12; i += 1) {
      deep = { nested: deep };
    }

    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
    expect((redact(Array.from({ length: 200 }, (_, i) => i)) as unknown[]).length).toBe(50);
  });
});

describe("hashEmail", () => {
  it("does not carry the address, or any part of it", () => {
    const hash = hashEmail("Someone@Example.com");

    expect(hash).not.toContain("someone");
    expect(hash).not.toContain("example");
    expect(hash).not.toContain("@");
  });

  it("gives the same answer whatever case or padding was typed", () => {
    // Otherwise repeated failures by one person would look like several people.
    expect(hashEmail("  Someone@Example.com ")).toBe(hashEmail("someone@example.com"));
  });

  it("separates different addresses", () => {
    expect(hashEmail("a@example.com")).not.toBe(hashEmail("b@example.com"));
  });

  it("answers empty for an empty address rather than hashing nothing", () => {
    expect(hashEmail("   ")).toBe("");
  });
});
