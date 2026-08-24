import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "@/lib/auth/redirect-target";

describe("safeRedirectTarget", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeRedirectTarget("/en/profile")).toBe("/en/profile");
    expect(safeRedirectTarget("/")).toBe("/");
    expect(safeRedirectTarget("/ar/wallet?tab=history")).toBe("/ar/wallet?tab=history");
    expect(safeRedirectTarget("/en/orders/123#invoice")).toBe("/en/orders/123#invoice");
  });

  it("normalizes traversal instead of echoing it", () => {
    expect(safeRedirectTarget("/games/../profile")).toBe("/profile");
  });

  it("rejects the backslash bypass that reads as protocol-relative in a browser", () => {
    expect(safeRedirectTarget("/\\evil.com")).toBeNull();
  });

  it("rejects backslashes smuggled through percent-encoding", () => {
    expect(safeRedirectTarget("/%5Cevil.com")).toBeNull();
  });

  it("rejects protocol-relative and absolute targets", () => {
    expect(safeRedirectTarget("//evil.com")).toBeNull();
    expect(safeRedirectTarget("///evil.com")).toBeNull();
    expect(safeRedirectTarget("https://evil.com/next")).toBeNull();
    expect(safeRedirectTarget("HTTPS://evil.com")).toBeNull();
    expect(safeRedirectTarget("javascript:alert(1)")).toBeNull();
  });

  it("rejects control characters, including header injection attempts", () => {
    expect(safeRedirectTarget("/en\r\nx-action-redirect: //evil.com")).toBeNull();
    expect(safeRedirectTarget("/\u0000")).toBeNull();
    expect(safeRedirectTarget("/\u007f")).toBeNull();
  });

  it("rejects values without a leading slash", () => {
    expect(safeRedirectTarget("en/profile")).toBeNull();
    expect(safeRedirectTarget("https:\\\\evil.com")).toBeNull();
    expect(safeRedirectTarget("")).toBeNull();
  });

  it("rejects malformed percent-encoding rather than guessing", () => {
    expect(safeRedirectTarget("/50%off")).toBeNull();
    expect(safeRedirectTarget("/%zz")).toBeNull();
  });

  it("rejects anything that is not a string", () => {
    expect(safeRedirectTarget(undefined)).toBeNull();
    expect(safeRedirectTarget(null)).toBeNull();
    expect(safeRedirectTarget(42)).toBeNull();
  });
});
