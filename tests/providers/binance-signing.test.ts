import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildPayload,
  createNonce,
  sign,
  signedRequest,
  toMerchantTradeNo,
} from "@/providers/binance/signing";

describe("the string Binance Pay signs", () => {
  it("is timestamp, nonce, body, each followed by a newline", () => {
    // Including the trailing one. Every part of this is load-bearing: a missing
    // newline and a reordered field both fail as `INVALID_SIGNATURE`, which says
    // nothing about which mistake was made.
    expect(buildPayload(1700000000000, "abcABC", '{"a":1}')).toBe(
      '1700000000000\nabcABC\n{"a":1}\n',
    );
  });

  it("uses LF, never CRLF", () => {
    expect(buildPayload(1, "n", "{}")).not.toContain("\r");
  });
});

describe("the signature", () => {
  it("is an uppercase hex HMAC-SHA512 over that payload", () => {
    const payload = buildPayload(1700000000000, "nonce", "{}");
    const expected = createHmac("sha512", "secret").update(payload, "utf8").digest("hex");

    expect(sign(payload, "secret")).toBe(expected.toUpperCase());
    expect(sign(payload, "secret")).toMatch(/^[0-9A-F]+$/);
  });

  it("changes when any one part of the payload changes", () => {
    const base = sign(buildPayload(1, "n", "{}"), "secret");

    expect(sign(buildPayload(2, "n", "{}"), "secret")).not.toBe(base);
    expect(sign(buildPayload(1, "m", "{}"), "secret")).not.toBe(base);
    expect(sign(buildPayload(1, "n", '{"a":1}'), "secret")).not.toBe(base);
    expect(sign(buildPayload(1, "n", "{}"), "other")).not.toBe(base);
  });
});

describe("the nonce", () => {
  it("is exactly 32 letters, as documented", () => {
    const nonce = createNonce();

    expect(nonce).toHaveLength(32);
    expect(nonce).toMatch(/^[a-zA-Z]{32}$/);
  });

  it("differs between calls", () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});

describe("a signed request", () => {
  it("signs the exact body string it hands back", () => {
    /*
     * The reason this returns the body at all. Serialising an object twice is
     * not guaranteed to produce identical bytes, and a body signed in one pass
     * and sent in another is the failure this shape exists to make impossible.
     */
    const request = signedRequest({
      body: { merchantTradeNo: "abc123", orderAmount: 10 },
      apiKey: "key",
      secret: "secret",
      timestamp: 1700000000000,
      nonce: "n".repeat(32),
    });

    const expected = sign(
      buildPayload(1700000000000, "n".repeat(32), request.body),
      "secret",
    );

    expect(request.headers["BinancePay-Signature"]).toBe(expected);
  });

  it("carries all five documented headers", () => {
    const request = signedRequest({ body: {}, apiKey: "key", secret: "secret" });

    expect(Object.keys(request.headers).sort()).toEqual([
      "BinancePay-Certificate-SN",
      "BinancePay-Nonce",
      "BinancePay-Signature",
      "BinancePay-Timestamp",
      "content-type",
    ]);
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers["BinancePay-Certificate-SN"]).toBe("key");
  });

  it("never puts the secret in a header", () => {
    const request = signedRequest({ body: {}, apiKey: "key", secret: "super-secret" });

    expect(JSON.stringify(request.headers)).not.toContain("super-secret");
  });
});

describe("the merchant trade number", () => {
  it("strips the dashes a UUID carries, which Binance does not allow", () => {
    const tradeNo = toMerchantTradeNo("0f8fad5b-d9cb-469f-a165-70867728950e");

    expect(tradeNo).toBe("0f8fad5bd9cb469fa16570867728950e");
    expect(tradeNo).toMatch(/^[a-zA-Z0-9]+$/);
  });

  it("stays within the documented 32 characters", () => {
    expect(toMerchantTradeNo("0f8fad5b-d9cb-469f-a165-70867728950e").length).toBeLessThanOrEqual(32);
  });

  it("is the same every time for one top-up, so a repeat is refused as a duplicate", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

    expect(toMerchantTradeNo(id)).toBe(toMerchantTradeNo(id));
  });
});
