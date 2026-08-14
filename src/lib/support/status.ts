/**
 * The states a support thread can be in.
 *
 * Kept out of the service for the same reason `order-status.ts` is: the queue's
 * buttons are a client component, and importing this vocabulary from a module
 * that carries `server-only` would drag the Supabase client and the logger into
 * the browser bundle — which is a build error, and would be a leak if it were
 * not.
 *
 * Mirrors the check constraint on `support_threads.status`. The database is the
 * authority; this is the copy the interface is allowed to read.
 */

export const SUPPORT_STATUSES = ["open", "pending", "resolved", "closed"] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export function isSupportStatus(value: string): value is SupportStatus {
  return (SUPPORT_STATUSES as readonly string[]).includes(value);
}
