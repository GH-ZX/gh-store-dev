import { describe, expect, it } from "vitest";
import { checkCallbackUrl } from "@/lib/settings/callback-url";
import { functionUrl, samCallbackUrl, SAM_WEBHOOK_FUNCTION } from "@/lib/supabase/functions-url";

const PROJECT = "https://njlzgfddfnnqujaodbta.supabase.co";

describe("edge function URLs", () => {
  it("builds the address Supabase serves a function from", () => {
    expect(functionUrl(PROJECT, SAM_WEBHOOK_FUNCTION)).toBe(
      "https://njlzgfddfnnqujaodbta.supabase.co/functions/v1/sam-webhook",
    );
  });

  it("tolerates a trailing slash or stray whitespace in the project URL", () => {
    expect(functionUrl(`${PROJECT}/`, "sam-webhook")).toBe(`${PROJECT}/functions/v1/sam-webhook`);
    expect(functionUrl(`  ${PROJECT}  `, "sam-webhook")).toBe(`${PROJECT}/functions/v1/sam-webhook`);
  });

  it("is reachable by Sam, which is the whole reason the callback lives here", () => {
    // The store's own address is localhost during development, so a callback
    // hosted on it could never be delivered. A hosted Supabase project is public
    // and HTTPS wherever the store happens to be running.
    expect(checkCallbackUrl(functionUrl(PROJECT, SAM_WEBHOOK_FUNCTION))).toBe("ok");
  });

  it("still warns when Supabase itself is running locally", () => {
    expect(checkCallbackUrl(functionUrl("http://127.0.0.1:54321", SAM_WEBHOOK_FUNCTION))).toBe(
      "local",
    );
  });

  it("shows the dashboard the exact address the invoice carries", () => {
    /*
     * These were built in two places once, and the panel went on displaying the
     * store's own URL after invoices had moved to Supabase — an owner reading it
     * would debug an address nothing used. One builder, one address.
     */
    expect(samCallbackUrl(PROJECT, "a-secret")).toBe(
      `${PROJECT}/functions/v1/sam-webhook?token=a-secret`,
    );
  });

  it("escapes a secret that would otherwise break the query string", () => {
    expect(samCallbackUrl(PROJECT, "a b&c=d")).toBe(
      `${PROJECT}/functions/v1/sam-webhook?token=a%20b%26c%3Dd`,
    );
  });

  it("falls back to the bare address before a secret has been generated", () => {
    // Nothing to authenticate with yet; the panel says so separately rather than
    // showing a token-less address as if it were usable.
    expect(samCallbackUrl(PROJECT, null)).toBe(`${PROJECT}/functions/v1/sam-webhook`);
    expect(samCallbackUrl(PROJECT)).toBe(`${PROJECT}/functions/v1/sam-webhook`);
  });
});
