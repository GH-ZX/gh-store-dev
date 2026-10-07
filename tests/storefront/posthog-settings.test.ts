import { describe, expect, it } from "vitest";
import {
  DEFAULT_POSTHOG_SETTINGS,
  posthogSettingsSchema,
} from "@/lib/settings/experience-settings";

/**
 * The PostHog settings contract.
 *
 * These assertions exist because the whole integration is gated on this one
 * parse. `experience-settings.service.ts` runs the database row through
 * `posthogSettingsSchema.safeParse` and returns `DEFAULT_POSTHOG_SETTINGS`
 * (analytics off, no key) when it fails — fail-closed by design, but it means a
 * schema that rejects a valid owner configuration silently disables analytics
 * with no error anywhere. The row shape below is copied from the live
 * `store_posthog_settings` table and from the dashboard form field names, so the
 * test fails if any of the four drift apart again.
 */

/** Exactly the columns `getPosthogSettings` selects, in live column names. */
const liveRowBeforeSetup = {
  id: true,
  enabled: false,
  project_key: "",
  region: "EU",
  project_id: "",
  updated_at: "2026-09-24T02:09:52.401199+03:00",
};

const liveRowAfterSetup = {
  id: true,
  enabled: true,
  project_key: `phc_${"A".repeat(40)}`,
  region: "EU",
  project_id: "123456",
  updated_at: "2026-10-10T00:00:00.000Z",
};

describe("posthog settings schema", () => {
  it("accepts the pre-setup row the live database actually holds", () => {
    // Extra columns (id, updated_at) must not defeat the parse: the service
    // selects the row and hands it to the schema as-is.
    const parsed = posthogSettingsSchema.safeParse(liveRowBeforeSetup);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.enabled).toBe(false);
      expect(parsed.data.project_key).toBe("");
    }
  });

  it("accepts a correctly configured row and keeps the key readable by the sender", () => {
    const parsed = posthogSettingsSchema.safeParse(liveRowAfterSetup);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // `posthog.service.ts` reads `settings.project_key` to build the request
      // body. A rename here would forward `undefined` as the api_key.
      expect(parsed.data.project_key).toBe(liveRowAfterSetup.project_key);
      expect(parsed.data.region).toBe("EU");
    }
  });

  it("uses the database column names, not camelCase aliases", () => {
    // Guards the specific drift that would break the integration: the table and
    // the dashboard form both say `project_key`.
    const parsed = posthogSettingsSchema.safeParse(liveRowAfterSetup);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data)).toContain("project_key");
      expect(Object.keys(parsed.data)).not.toContain("projectKey");
    }
  });

  it("accepts an empty project id, which is the default and is optional", () => {
    expect(
      posthogSettingsSchema.safeParse({ ...liveRowAfterSetup, project_id: "" }).success,
    ).toBe(true);
  });

  it("rejects a personal API key", () => {
    // The dashboard copy tells the owner "do not use a personal API key"; a
    // personal key is `phx_…` and cannot post events.
    const parsed = posthogSettingsSchema.safeParse({
      ...liveRowAfterSetup,
      project_key: "phx_personal_key_value",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects enabling analytics with no project key", () => {
    // Otherwise the sender would post with an empty api_key and every event
    // would be dropped upstream.
    const parsed = posthogSettingsSchema.safeParse({
      ...liveRowAfterSetup,
      enabled: true,
      project_key: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("permits a disabled row to hold a stored key, so the owner can keep it", () => {
    // The dashboard form leaves the field blank to preserve the saved key, so a
    // disabled row with a key present is a legitimate state.
    expect(
      posthogSettingsSchema.safeParse({ ...liveRowAfterSetup, enabled: false }).success,
    ).toBe(true);
  });

  it("defaults to analytics off with an empty key", () => {
    expect(DEFAULT_POSTHOG_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_POSTHOG_SETTINGS.project_key).toBe("");
    expect(posthogSettingsSchema.safeParse(DEFAULT_POSTHOG_SETTINGS).success).toBe(true);
  });
});
