import { describe, expect, it } from "vitest";
import {
  mergeBatStoreSettings,
  readBatStoreCredentials,
  toBatStoreStatus,
} from "@/lib/settings/batstore-settings";
import {
  classifyBatStoreStatus,
  BatStoreAuthError,
  BatStoreError,
} from "@/providers/batstore/errors";
import type { Json } from "@/types/database";

const NOW = "2026-08-17T12:00:00.000Z";

function asObject(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }

  return value;
}

describe("BatStore credentials", () => {
  it("returns defaults when nothing is configured", () => {
    expect(readBatStoreCredentials({})).toEqual({
      apiToken: null,
      markupPercent: 15,
      enabled: false,
    });
  });

  it("survives a hand-edited settings blob", () => {
    expect(readBatStoreCredentials("nonsense").apiToken).toBeNull();
    expect(readBatStoreCredentials({ batstore: "nonsense" }).apiToken).toBeNull();
  });

  it("is never enabled without a token", () => {
    expect(readBatStoreCredentials({ batstore: { enabled: true } }).enabled).toBe(false);
  });

  it("exposes a masked hint and never the token", () => {
    const status = toBatStoreStatus({ batstore: { api_token: "batstore-secret-token-9876" } });

    expect(status.configured).toBe(true);
    expect(status.tokenHint).toBe("••••••••9876");
    expect(JSON.stringify(status)).not.toContain("batstore-secret-token");
  });
});

describe("merging BatStore settings", () => {
  it("keeps the stored token when none is supplied", () => {
    const merged = mergeBatStoreSettings(
      { batstore: { api_token: "keep-me" } },
      { markupPercent: 25 },
      NOW,
    );

    expect(readBatStoreCredentials(merged)).toMatchObject({
      apiToken: "keep-me",
      markupPercent: 25,
    });
  });

  it("leaves the other suppliers alone", () => {
    const merged = mergeBatStoreSettings(
      { g2bulk: { api_key: "g2-key", webhook_secret: "callback" }, maxstore: { api_token: "mx" } },
      { apiToken: "bat-token" },
      NOW,
    );

    expect(asObject(merged).g2bulk).toEqual({ api_key: "g2-key", webhook_secret: "callback" });
    expect(asObject(merged).maxstore).toEqual({ api_token: "mx" });
  });

  it("enables the provider on the first token saved", () => {
    expect(readBatStoreCredentials(mergeBatStoreSettings({}, { apiToken: "t" }, NOW)).enabled).toBe(
      true,
    );
  });

  it("is disabled once the token is cleared", () => {
    const merged = mergeBatStoreSettings({ batstore: { api_token: "t" } }, { apiToken: "  " }, NOW);

    expect(readBatStoreCredentials(merged).enabled).toBe(false);
  });
});

describe("classifying BatStore failures", () => {
  it("treats every token refusal as auth, so nothing retries into a block", () => {
    for (const status of [401, 403]) {
      expect(classifyBatStoreStatus(status, "no")).toBeInstanceOf(BatStoreAuthError);
      expect(classifyBatStoreStatus(status, "no").retryable).toBe(false);
    }
  });

  it("marks rate limiting and server errors as worth retrying", () => {
    expect(classifyBatStoreStatus(429, "slow down").kind).toBe("rate_limit");
    expect(classifyBatStoreStatus(503, "maintenance").retryable).toBe(true);
  });

  it("treats a refused purchase as the caller's problem, not a retry", () => {
    // 402 is insufficient balance, 400/422 a bad request: the same call would be
    // refused the same way a second time.
    for (const status of [400, 402, 422]) {
      expect(classifyBatStoreStatus(status, "no").kind).toBe("request");
      expect(classifyBatStoreStatus(status, "no").retryable).toBe(false);
    }
  });

  it("defaults an unknown non-server status to a request failure", () => {
    expect(classifyBatStoreStatus(418, "teapot")).toBeInstanceOf(BatStoreError);
    expect(classifyBatStoreStatus(418, "teapot").kind).toBe("request");
  });
});