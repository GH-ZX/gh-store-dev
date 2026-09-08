/**
 * Logging the result of something the store tried to do.
 *
 * Every money path in this codebase already answers the same shape — `{ ok: true,
 * … }` or `{ ok: false, reason }`, with the reason decided by a classifier the
 * service already owns. So the log call at the end of one is always the same
 * call, and writing it out by hand at each exit is how an event vocabulary drifts:
 * `order_failed` here, `checkout_error` there, and no way to count either.
 *
 * Success is `info` — state changed, and that is the stream an operator wants by
 * default. Failure is `warn` rather than `error`, because these are the outcomes
 * the code anticipated and handled: an insufficient balance is the system working.
 * An `error` in this codebase means something nobody planned for, and keeping that
 * line sharp is what makes the errors-only filter worth having.
 *
 * No `server-only` import, so the level mapping can be tested directly.
 */

export type Outcome = { ok: true } | { ok: false; reason: string };

export type OutcomeLevel = "info" | "warn";

/** `info` when it worked, `warn` when it did not. */
export function outcomeLevel(result: Outcome): OutcomeLevel {
  return result.ok ? "info" : "warn";
}

/**
 * The fields an outcome contributes, on top of whatever the caller passes.
 *
 * A failure carries its reason; a success carries nothing extra, because `ok` is
 * already implied by the level and a field that is always the same is noise.
 */
export function outcomeFields(result: Outcome): Record<string, unknown> {
  return result.ok ? {} : { reason: result.reason };
}

/**
 * Path segments that are values rather than route structure.
 *
 * A Sam wallet call puts the identifier in the path, so logging the path raw
 * would put a customer's phone number or wallet address into the log — the exact
 * thing {@link import("./redact").redact} exists to prevent, except redact only
 * shortens long hex and a Syriatel identifier is a phone number.
 *
 * Anything that looks like a value is replaced, and anything that looks like a
 * word is kept, so the result groups: every wallet transaction read logs the same
 * `/v1/wallets/shamcash/:id/transactions` and can be counted.
 */
const ALL_DIGITS = /^\d+$/;
const LONG_HEX = /^[0-9a-f]{8,}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENCODED = /%[0-9A-Fa-f]{2}/;

/** Long enough that no route word is this, short enough to catch opaque ids. */
const OPAQUE_LENGTH = 16;

function isIdLike(segment: string): boolean {
  /*
   * Deliberately not "contains a digit": that would turn `/v1/` into `/:id/` and
   * throw away the only part of the path worth grouping by.
   */
  return (
    ALL_DIGITS.test(segment) ||
    UUID.test(segment) ||
    LONG_HEX.test(segment) ||
    ENCODED.test(segment) ||
    segment.length >= OPAQUE_LENGTH
  );
}

export function sanitisePath(path: string): string {
  const [withoutQuery] = path.split("?");

  return withoutQuery
    .split("/")
    .map((segment) => (segment.length > 0 && isIdLike(segment) ? ":id" : segment))
    .join("/");
}
