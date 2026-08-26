import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The Telegram link-code contract.
 *
 * The bot is a Deno edge function this repo's TypeScript never sees, so nothing
 * else fails a build when its RPC call and the database drift apart — and they
 * did once already, when refusal messages were looked up by keys none of the
 * dictionaries defined. These assertions are the compile step between the two
 * halves.
 */

const webhook = readFileSync("supabase/functions/telegram-webhook/index.ts", "utf8");

const migrations = {
  hardening: "supabase/migrations/20260826010000_telegram_link_code_hardening.sql",
} as const;

describe("telegram link codes", () => {
  it("consumes codes through the hardened atomic RPC", () => {
    const sql = readFileSync(migrations.hardening, "utf8");

    expect(sql).toContain("create or replace function public.consume_telegram_link_code(");
    expect(webhook).toContain('rpc("consume_telegram_link_code"');

    // The guessing budget lives in the database, not in bot memory that resets.
    expect(sql).toContain("failed_count");
    expect(sql).toContain("for update");
  });

  it("no longer reads then writes the code table itself", () => {
    // A read-then-write let two messages race one code into two chats.
    expect(webhook).not.toContain('.from("telegram_link_codes")\n    .select');
  });

  it("messages every refusal reason with a key the dictionaries define", () => {
    for (const reason of ["invalid", "used", "expired", "rate_limited"]) {
      expect(webhook).toContain(`"${reason}"`);
    }

    // The texts are keyed camelCase; the old template built snake_case keys
    // that resolved to undefined at runtime.
    expect(webhook).not.toContain("`code_${result.reason}`");

    const keyCount = webhook.split("codeRateLimited").length - 1;

    // Once in the Texts type, once per locale dictionary.
    expect(keyCount).toBeGreaterThanOrEqual(3);
  });

  it("mints codes from the platform CSPRNG", () => {
    const service = readFileSync("src/lib/services/telegram-link.service.ts", "utf8");

    expect(service).toContain("crypto.getRandomValues");
    expect(service).not.toContain("Math.random()");
  });
});
