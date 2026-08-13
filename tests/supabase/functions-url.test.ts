import { describe, expect, it } from "vitest";
import { checkCallbackUrl } from "@/lib/settings/callback-url";
import { functionUrl, SAM_WEBHOOK_FUNCTION } from "@/lib/supabase/functions-url";

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
});
