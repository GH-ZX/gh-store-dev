import { randomUUID } from "node:crypto";

/**
 * A callback secret, generated rather than typed.
 *
 * Two UUIDs' worth of hex: long enough that guessing is hopeless, and produced
 * server-side so an owner cannot accidentally choose something weak.
 *
 * Shared by both callbacks. Neither provider signs its requests, so for both of
 * them this string is the entire difference between a report from the supplier
 * and a report from a stranger — which is not a property to reimplement per
 * integration and hope the second copy is as careful.
 */
export function newCallbackSecret(): string {
  return `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
}
