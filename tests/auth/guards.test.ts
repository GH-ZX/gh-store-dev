import { describe, expect, it } from "vitest";
import { isAdminProfile } from "@/lib/auth/guards";

describe("profile authorization", () => {
  it("recognizes only active admin profiles", () => {
    expect(isAdminProfile({ role: "admin", is_active: true })).toBe(true);
    expect(isAdminProfile({ role: "admin", is_active: false })).toBe(false);
    expect(isAdminProfile({ role: "customer", is_active: true })).toBe(false);
    expect(isAdminProfile(null)).toBe(false);
  });
});
