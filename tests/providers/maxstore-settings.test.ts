import { describe, expect, it } from "vitest";
import {
  mergeMaxStoreSettings,
  readMaxStoreCredentials,
  toMaxStoreStatus,
} from "@/lib/settings/maxstore-settings";
import {
  classifyMaxStoreCode,
  classifyMaxStoreStatus,
  MaxStoreAuthError,
} from "@/providers/maxstore/errors";
import {
  classifyOrderStatus,
  productsSchema,
  readAvailable,
  readProductCategory,
} from "@/providers/maxstore/schemas";
import {
  readCategoryNames,
  readContentProductIds,
  toMaxStoreGameSlug,
} from "@/providers/maxstore/mapping";
import type { Json } from "@/types/database";

const NOW = "2026-08-14T12:00:00.000Z";

function asObject(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }

  return value;
}

describe("MaxStore credentials", () => {
  it("returns defaults when nothing is configured", () => {
    expect(readMaxStoreCredentials({})).toEqual({
      apiToken: null,
      markupPercent: 15,
      enabled: false,
    });
  });

  it("survives a hand-edited settings blob", () => {
    expect(readMaxStoreCredentials("nonsense").apiToken).toBeNull();
    expect(readMaxStoreCredentials({ maxstore: "nonsense" }).apiToken).toBeNull();
  });

  it("is never enabled without a token", () => {
    expect(readMaxStoreCredentials({ maxstore: { enabled: true } }).enabled).toBe(false);
  });

  it("exposes a masked hint and never the token", () => {
    const status = toMaxStoreStatus({ maxstore: { api_token: "maxstore-secret-token-9876" } });

    expect(status.configured).toBe(true);
    expect(status.tokenHint).toBe("••••••••9876");
    expect(JSON.stringify(status)).not.toContain("maxstore-secret-token");
  });
});

describe("merging MaxStore settings", () => {
  it("keeps the stored token when none is supplied", () => {
    const merged = mergeMaxStoreSettings(
      { maxstore: { api_token: "keep-me" } },
      { markupPercent: 25 },
      NOW,
    );

    expect(readMaxStoreCredentials(merged)).toMatchObject({
      apiToken: "keep-me",
      markupPercent: 25,
    });
  });

  it("leaves the other suppliers alone", () => {
    // The whole column is shared. A store with several providers must never lose
    // one because another was saved.
    const merged = mergeMaxStoreSettings(
      { g2bulk: { api_key: "g2-key", webhook_secret: "callback" }, sam: { api_key: "sam" } },
      { apiToken: "max-token" },
      NOW,
    );

    expect(asObject(merged).g2bulk).toEqual({ api_key: "g2-key", webhook_secret: "callback" });
    expect(asObject(merged).sam).toEqual({ api_key: "sam" });
  });

  it("enables the provider on the first token saved", () => {
    expect(readMaxStoreCredentials(mergeMaxStoreSettings({}, { apiToken: "t" }, NOW)).enabled).toBe(
      true,
    );
  });

  it("is disabled once the token is cleared", () => {
    const merged = mergeMaxStoreSettings({ maxstore: { api_token: "t" } }, { apiToken: "  " }, NOW);

    expect(readMaxStoreCredentials(merged).enabled).toBe(false);
  });
});

describe("classifying MaxStore failures", () => {
  it("treats every token refusal as auth, so nothing retries into an IP block", () => {
    // 123 is "IP blocked". Retrying a bad token is how a store loses its
    // supplier entirely, so all four of these have to stop the caller.
    for (const code of [120, 121, 122, 123]) {
      expect(classifyMaxStoreCode(code, "no")).toBeInstanceOf(MaxStoreAuthError);
      expect(classifyMaxStoreCode(code, "no").retryable).toBe(false);
    }
  });

  it("marks rate limiting and maintenance as worth retrying", () => {
    expect(classifyMaxStoreCode(111, "slow down").kind).toBe("rate_limit");
    expect(classifyMaxStoreCode(130, "maintenance").retryable).toBe(true);
  });

  it("treats a refused purchase as the caller's problem, not a retry", () => {
    // Insufficient balance, missing field, product gone: the same call would be
    // refused the same way a second time.
    for (const code of [100, 105, 106, 109, 110]) {
      expect(classifyMaxStoreCode(code, "no").kind).toBe("request");
      expect(classifyMaxStoreCode(code, "no").retryable).toBe(false);
    }
  });

  it("falls back to the HTTP status when no code is carried", () => {
    expect(classifyMaxStoreStatus(429, "x").kind).toBe("rate_limit");
    expect(classifyMaxStoreStatus(503, "x").kind).toBe("server");
    expect(classifyMaxStoreStatus(400, "x").kind).toBe("request");
    expect(classifyMaxStoreStatus(401, "x")).toBeInstanceOf(MaxStoreAuthError);
  });
});

describe("reading a MaxStore order", () => {
  it("settles only on an explicit answer", () => {
    expect(classifyOrderStatus("accept")).toBe("completed");
    expect(classifyOrderStatus("reject")).toBe("failed");
  });

  it("treats waiting — and anything unrecognised — as still working", () => {
    // Refunding a `wait` would give the goods away, and an unknown word is not
    // evidence of failure.
    expect(classifyOrderStatus("wait")).toBe("pending");
    expect(classifyOrderStatus("something-new")).toBe("pending");
    expect(classifyOrderStatus(undefined)).toBe("pending");
  });
});

describe("reading MaxStore categories", () => {
  it("reads category ids and names from product variants", () => {
    expect(readProductCategory({ category_id: 12, category_title: "PUBG" })).toEqual({
      id: "12",
      title: "PUBG",
    });
    expect(readProductCategory({ category: { id: 13, name: "Free Fire" } })).toEqual({
      id: "13",
      title: "Free Fire",
    });
    expect(readProductCategory({ categoryId: "14", categoryTitle: "Top ups" })).toEqual({
      id: "14",
      title: "Top ups",
    });
  });

  it("accepts wrapped product lists without losing category fields", () => {
    const result = productsSchema.parse({
      data: {
        products: [{ id: 1, title: "UC", category_id: 12, category_title: "PUBG" }],
      },
    });

    expect(result[0].category_id).toBe("12");
    expect(result[0].category_title).toBe("PUBG");
  });

  it("walks nested content responses for category names", () => {
    expect(
      [...readCategoryNames({ data: { categories: [{ id: 12, title: "PUBG" }] } })],
    ).toEqual([["12", "PUBG"]]);
  });

  it("uses the product title when the provider omits a category id", () => {
    expect(readProductCategory({ category: "Social services" })).toEqual({
      id: null,
      title: "Social services",
    });
  });

  it("recovers product ids from nested category content", () => {
    expect(
      readContentProductIds({
        data: { products: [{ product_id: 12, price: 0.95 }, { id: 15, available: true }] },
      }),
    ).toEqual(["12", "15"]);
  });

  it("keeps category container slugs URL-safe", () => {
    expect(toMaxStoreGameSlug({ id: "name:social services", title: "Services" })).toBe(
      "services-name-social-services",
    );
  });
});

describe("reading availability", () => {
  it("accepts the shapes a JSON API might use", () => {
    expect(readAvailable(true)).toBe(true);
    expect(readAvailable(1)).toBe(true);
    expect(readAvailable("1")).toBe(true);
    expect(readAvailable(false)).toBe(false);
    expect(readAvailable(0)).toBe(false);
  });

  it("assumes sellable for an undocumented shape rather than hiding a live product", () => {
    expect(readAvailable(undefined)).toBe(true);
  });
});
