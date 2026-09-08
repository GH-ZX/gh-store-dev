import { describe, expect, it } from "vitest";
import {
  isValidSamIdentifier,
  mergeSamSettings,
  readAvailableSamMethods,
  readSamCredentials,
  toSamStatus,
} from "@/lib/settings/sam-settings";

const SHAMCASH = "e5289b724c3a3a47581b575bfdf6cd53";
const STAMP = "2026-08-13T00:00:00.000Z";

describe("isValidSamIdentifier", () => {
  it("accepts a 32-character ShamCash address and rejects near-misses", () => {
    expect(isValidSamIdentifier("shamcash", SHAMCASH)).toBe(true);
    expect(isValidSamIdentifier("shamcash", SHAMCASH.slice(0, 31))).toBe(false);
    // A phone number is a plausible mistake, and Sam would reject it at payment.
    expect(isValidSamIdentifier("shamcash", "0991234567")).toBe(false);
  });

  it("accepts a Syriatel phone or cash code", () => {
    expect(isValidSamIdentifier("syriatel", "0991234567")).toBe(true);
    expect(isValidSamIdentifier("syriatel", "12345678")).toBe(true);
    expect(isValidSamIdentifier("syriatel", "991234567")).toBe(false);
  });

  it("treats blank as invalid rather than as an empty wallet", () => {
    expect(isValidSamIdentifier("shamcash", "   ")).toBe(false);
    expect(isValidSamIdentifier("shamcash", null)).toBe(false);
  });
});

describe("manual review", () => {
  it("is off when absent, so a payment Sam confirmed credits without waiting", () => {
    expect(readSamCredentials(undefined).manualReview).toBe(false);
    expect(readSamCredentials({ sam: {} }).manualReview).toBe(false);
    // Only a real boolean counts; a stray string must not hold money back.
    expect(readSamCredentials({ sam: { manual_review: "yes" } }).manualReview).toBe(false);
  });

  it("is on only for a real true", () => {
    expect(readSamCredentials({ sam: { manual_review: true } }).manualReview).toBe(true);
  });
});

describe("readAvailableSamMethods", () => {
  it("withholds a method with no wallet to send money to", () => {
    const credentials = readSamCredentials({
      sam: { api_key: "sk_live", enabled: true, shamcash_identifier: SHAMCASH },
    });

    expect(readAvailableSamMethods(credentials)).toEqual(["shamcash"]);
  });

  it("offers nothing without a key, whatever the flags say", () => {
    const credentials = readSamCredentials({
      sam: { enabled: true, shamcash_identifier: SHAMCASH, syriatel_identifier: "0991234567" },
    });

    expect(readAvailableSamMethods(credentials)).toEqual([]);
  });

  it("withholds a method whose stored wallet is malformed", () => {
    const credentials = readSamCredentials({
      sam: { api_key: "sk_live", enabled: true, shamcash_identifier: "too-short" },
    });

    expect(readAvailableSamMethods(credentials)).toEqual([]);
  });
});

describe("mergeSamSettings", () => {
  it("keeps the stored key when the field is left blank", () => {
    const merged = mergeSamSettings(
      { sam: { api_key: "sk_original", enabled: true, shamcash_identifier: SHAMCASH } },
      { enabled: true, manualReview: true },
      STAMP,
    );

    expect(readSamCredentials(merged).apiKey).toBe("sk_original");
    expect(readSamCredentials(merged).manualReview).toBe(true);
  });

  it("clears the key on an explicit empty string, and switches the provider off", () => {
    const merged = mergeSamSettings(
      { sam: { api_key: "sk_original", enabled: true } },
      { apiKey: "" },
      STAMP,
    );

    expect(readSamCredentials(merged).apiKey).toBeNull();
    expect(readSamCredentials(merged).enabled).toBe(false);
  });

  it("enables the provider on the very first key", () => {
    // The bug this guards: deriving `enabled` from the previous value, which is
    // necessarily false before any key exists, saved the new key as disabled.
    const merged = mergeSamSettings({}, { apiKey: "sk_first" }, STAMP);

    expect(toSamStatus(merged).enabled).toBe(true);
    expect(toSamStatus(merged).configured).toBe(true);
  });

  it("respects an explicit off while other fields change", () => {
    const merged = mergeSamSettings(
      { sam: { api_key: "sk_original", enabled: false } },
      { shamcashIdentifier: SHAMCASH },
      STAMP,
    );

    expect(readSamCredentials(merged).enabled).toBe(false);
  });

  it("leaves the supplier key untouched", () => {
    const merged = mergeSamSettings(
      { g2bulk: { api_key: "supplier-key", markup_percent: 15 } },
      { apiKey: "sk_sam" },
      STAMP,
    ) as { g2bulk?: { api_key?: string } };

    expect(merged.g2bulk?.api_key).toBe("supplier-key");
  });

  it("keeps the callback secret, so a save cannot rotate it behind Sam's back", () => {
    // Sam is told the callback URL when the invoice is created. Replacing the
    // secret on an unrelated save turns away the callback for every invoice
    // already in flight: the customer pays and is never credited.
    const merged = mergeSamSettings(
      { sam: { api_key: "sk_live", webhook_secret: "callback-secret" } },
      { manualReview: true },
      STAMP,
    ) as { sam?: { webhook_secret?: string } };

    expect(merged.sam?.webhook_secret).toBe("callback-secret");
  });

  it("keeps the callback secret even when the key is cleared", () => {
    const merged = mergeSamSettings(
      { sam: { api_key: "sk_live", webhook_secret: "callback-secret" } },
      { apiKey: "" },
      STAMP,
    ) as { sam?: { webhook_secret?: string; api_key?: string | null } };

    expect(merged.sam?.api_key).toBeNull();
    expect(merged.sam?.webhook_secret).toBe("callback-secret");
  });

  it("records which methods are usable so the customer RPC need not see the key", () => {
    const merged = mergeSamSettings(
      {},
      { apiKey: "sk_live", shamcashIdentifier: SHAMCASH, syriatelIdentifier: "bad" },
      STAMP,
    ) as { sam?: { methods?: string[] } };

    expect(merged.sam?.methods).toEqual(["shamcash"]);
  });

  it("never keeps a negative exchange rate", () => {
    const merged = mergeSamSettings({}, { apiKey: "sk", sypPerUsd: -5 }, STAMP);

    expect(readSamCredentials(merged).sypPerUsd).toBe(0);
  });

  it("falls back to dollars for an unrecognised currency", () => {
    const merged = mergeSamSettings({}, { apiKey: "sk", invoiceCurrency: "GBP" }, STAMP);

    expect(readSamCredentials(merged).invoiceCurrency).toBe("USD");
  });
});

describe("toSamStatus", () => {
  it("masks the key down to a tail", () => {
    const status = toSamStatus({ sam: { api_key: "sk_live_abcdefgh1234", enabled: true } });

    expect(status.keyHint).toBe("••••••••1234");
    expect(status.keyHint).not.toContain("sk_live");
  });

  it("reports whether a callback secret exists, without revealing it", () => {
    const configured = toSamStatus({ sam: { api_key: "sk_live", webhook_secret: "s3cret" } });

    expect(configured.webhookConfigured).toBe(true);
    expect(JSON.stringify(configured)).not.toContain("s3cret");

    expect(toSamStatus({ sam: { api_key: "sk_live" } }).webhookConfigured).toBe(false);
    expect(toSamStatus({ sam: { api_key: "sk_live", webhook_secret: "  " } }).webhookConfigured).toBe(
      false,
    );
  });

  it("reports an unconfigured provider without inventing defaults", () => {
    const status = toSamStatus({});

    expect(status).toMatchObject({
      configured: false,
      keyHint: null,
      enabled: false,
      manualReview: false,
      availableMethods: [],
    });
  });
});
