import { describe, expect, it } from "vitest";
import {
  maskSecret,
  mergeG2BulkSettings,
  readG2BulkCredentials,
  toG2BulkStatus,
} from "@/lib/settings/provider-settings";
import type { Json } from "@/types/database";

const NOW = "2026-08-12T12:00:00.000Z";

/** The merge returns `Json`; narrow it before reading a sibling provider's key. */
function asObject(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }

  return value;
}

describe("secret masking", () => {
  it("shows only a short tail", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("••••••••mnop");
  });

  it("masks a short secret completely, so the tail cannot leak most of it", () => {
    expect(maskSecret("abc123")).toBe("••••••••");
  });

  it("reports nothing for a missing secret", () => {
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret("  ")).toBeNull();
  });
});

describe("reading credentials", () => {
  it("returns defaults when nothing is configured", () => {
    expect(readG2BulkCredentials({})).toEqual({
      apiKey: null,
      markupPercent: 15,
      enabled: false,
    });
  });

  it("survives a malformed settings blob", () => {
    expect(readG2BulkCredentials("nonsense").apiKey).toBeNull();
    expect(readG2BulkCredentials({ g2bulk: "nonsense" }).apiKey).toBeNull();
  });

  it("clamps an out-of-range markup", () => {
    expect(readG2BulkCredentials({ g2bulk: { markup_percent: 9000 } }).markupPercent).toBe(500);
    expect(readG2BulkCredentials({ g2bulk: { markup_percent: -5 } }).markupPercent).toBe(0);
  });

  it("treats a configured provider as enabled unless turned off", () => {
    expect(readG2BulkCredentials({ g2bulk: { api_key: "k" } }).enabled).toBe(true);
    expect(readG2BulkCredentials({ g2bulk: { api_key: "k", enabled: false } }).enabled).toBe(false);
  });

  it("is never enabled without a key", () => {
    expect(readG2BulkCredentials({ g2bulk: { enabled: true } }).enabled).toBe(false);
  });
});

describe("status for the admin UI", () => {
  it("exposes a masked hint and never the key itself", () => {
    const status = toG2BulkStatus({
      g2bulk: { api_key: "secret-key-value-1234", markup_percent: 20, updated_at: NOW },
    });

    expect(status.configured).toBe(true);
    expect(status.keyHint).toBe("••••••••1234");
    expect(status.markupPercent).toBe(20);
    expect(status.updatedAt).toBe(NOW);
    expect(JSON.stringify(status)).not.toContain("secret-key-value");
  });

  it("reports an unconfigured provider", () => {
    expect(toG2BulkStatus({})).toMatchObject({ configured: false, keyHint: null, enabled: false });
  });
});

describe("merging an update", () => {
  it("keeps the stored key when none is supplied", () => {
    const merged = mergeG2BulkSettings(
      { g2bulk: { api_key: "keep-me", markup_percent: 15 } },
      { markupPercent: 25 },
      NOW,
    );

    expect(readG2BulkCredentials(merged)).toMatchObject({
      apiKey: "keep-me",
      markupPercent: 25,
    });
  });

  it("replaces the key when a new one is supplied", () => {
    const merged = mergeG2BulkSettings({ g2bulk: { api_key: "old" } }, { apiKey: "new" }, NOW);

    expect(readG2BulkCredentials(merged).apiKey).toBe("new");
  });

  it("clears the key on an explicit empty string", () => {
    const merged = mergeG2BulkSettings({ g2bulk: { api_key: "old" } }, { apiKey: "   " }, NOW);

    expect(readG2BulkCredentials(merged).apiKey).toBeNull();
  });

  it("leaves other providers' settings untouched", () => {
    const merged = mergeG2BulkSettings(
      { sam: { api_key: "sam-key" }, g2bulk: { api_key: "old" } },
      { markupPercent: 10 },
      NOW,
    );

    expect(asObject(merged).sam).toEqual({ api_key: "sam-key" });
  });

  it("records when the change happened", () => {
    const merged = mergeG2BulkSettings({}, { apiKey: "k" }, NOW);

    expect(toG2BulkStatus(merged).updatedAt).toBe(NOW);
  });
});

describe("enabling on first save", () => {
  it("enables the provider when the first key is saved", () => {
    const merged = mergeG2BulkSettings({}, { apiKey: "first-key", markupPercent: 15 }, NOW);

    expect(readG2BulkCredentials(merged).enabled).toBe(true);
  });

  it("keeps an explicit off while only the markup changes", () => {
    const merged = mergeG2BulkSettings(
      { g2bulk: { api_key: "k", enabled: false } },
      { markupPercent: 30 },
      NOW,
    );

    expect(readG2BulkCredentials(merged).enabled).toBe(false);
  });

  it("re-enables when a new key is pasted over a disabled provider", () => {
    const merged = mergeG2BulkSettings(
      { g2bulk: { api_key: "old", enabled: false } },
      { apiKey: "new-key" },
      NOW,
    );

    expect(readG2BulkCredentials(merged).enabled).toBe(true);
  });

  it("is disabled once the key is cleared", () => {
    const merged = mergeG2BulkSettings({ g2bulk: { api_key: "k" } }, { apiKey: "" }, NOW);

    expect(readG2BulkCredentials(merged).enabled).toBe(false);
  });
});
