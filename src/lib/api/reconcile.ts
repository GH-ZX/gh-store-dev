import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Extract the shared secret from the only authorization form this endpoint accepts.
 * Keeping parsing separate makes the accepted API contract explicit and testable.
 */
export function bearerToken(headers: Headers): string | null {
  const value = headers.get("authorization");

  if (!value) {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(value);
  const token = match?.[1]?.trim();

  return token || null;
}

/**
 * Compare the scheduler credential without exposing the secret through a direct
 * string comparison. Both values are hashed first, so timingSafeEqual always
 * receives buffers of the same length.
 */
export function isReconcileAuthorized(headers: Headers, expectedValue: string | undefined): boolean {
  const expected = expectedValue?.trim();
  const presented = bearerToken(headers);

  if (!expected || !presented) {
    return false;
  }

  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
}
