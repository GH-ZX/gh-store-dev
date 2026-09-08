/**
 * What must never reach a log.
 *
 * Logs leave the building. They sit in a third-party service, get read on
 * laptops, and are pasted into chat when something breaks — so a supplier key or
 * a callback secret that reaches one has effectively been published, and
 * rotating it is the only remedy.
 *
 * Redaction is by field name rather than by value, because a value cannot be
 * recognised as a secret by looking at it: an API key and an order reference are
 * both just strings. Anything whose name suggests a credential is replaced
 * whole, at every depth, before the event is serialised.
 *
 * The wallet address rule is different in kind. It is not a credential, but it
 * is the store's money destination and a customer's account identifier, and
 * neither belongs in a debugging trail — so long hex runs are shortened to
 * enough to recognise and not enough to use.
 */

import { createHash } from "node:crypto";

const SECRET_KEY = /(?:token|secret|password|authorization|cookie|api[-_]?key|credential|signature)/i;

/** A 32-character hex run: ShamCash addresses, and most opaque provider ids. */
const LONG_HEX = /\b[0-9a-f]{24,}\b/gi;

export const REDACTED = "[redacted]";

/** Keep enough of a long identifier to match it against another log line. */
function shorten(value: string): string {
  return value.replace(LONG_HEX, (match) => `${match.slice(0, 4)}…${match.slice(-3)}`);
}

/**
 * An email address as something a log may carry.
 *
 * A failed sign-in is worth recording — ten failures against one account in a
 * minute is credential stuffing, and ten failures across ten accounts is a
 * different problem — but neither question needs the address itself, and logs
 * leave the building.
 *
 * This is an identifier, not a secret. Anyone already holding an address can
 * confirm a match by hashing it, and that is fine: the goal is that Axiom does
 * not accumulate a list of customer email addresses in plaintext, not that the
 * value is unguessable. Lowercased and trimmed first, so the same person
 * produces the same hash whatever they typed.
 */
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();

  if (normalized.length === 0) {
    return "";
  }

  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 8);
}

export function redact(value: unknown, depth = 0): unknown {
  // A cycle or a pathologically deep object must not hang the logger.
  if (depth > 6) {
    return "[truncated]";
  }

  if (typeof value === "string") {
    return shorten(value);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redact(entry, depth + 1));
  }

  const out: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redact(entry, depth + 1);
  }

  return out;
}
