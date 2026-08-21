import { describe, expect, it } from "vitest";
import { bearerToken, isReconcileAuthorized } from "@/lib/api/reconcile";

function headers(authorization?: string): Headers {
  const value = new Headers();

  if (authorization !== undefined) {
    value.set("authorization", authorization);
  }

  return value;
}

describe("reconciliation API authorization", () => {
  it("accepts a bearer token regardless of the scheme casing", () => {
    expect(bearerToken(headers("Bearer sweep-secret"))).toBe("sweep-secret");
    expect(bearerToken(headers("bearer sweep-secret"))).toBe("sweep-secret");
  });

  it("trims the token but rejects an empty bearer value", () => {
    expect(bearerToken(headers("Bearer   sweep-secret  "))).toBe("sweep-secret");
    expect(bearerToken(headers("Bearer   "))).toBeNull();
  });

  it("rejects missing, malformed, and wrong credentials", () => {
    expect(isReconcileAuthorized(headers(), "sweep-secret")).toBe(false);
    expect(isReconcileAuthorized(headers("Basic sweep-secret"), "sweep-secret")).toBe(false);
    expect(isReconcileAuthorized(headers("Bearer wrong"), "sweep-secret")).toBe(false);
    expect(isReconcileAuthorized(headers("Bearer sweep-secret"), undefined)).toBe(false);
  });

  it("accepts only the configured bearer credential", () => {
    expect(isReconcileAuthorized(headers("Bearer sweep-secret"), "sweep-secret")).toBe(true);
    expect(isReconcileAuthorized(headers("Bearer   sweep-secret  "), " sweep-secret ")).toBe(true);
  });
});
