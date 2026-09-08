/**
 * Reconciliation sweep state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. `summary` carries the counts of a finished run so the panel can say
 * what the sweep actually did rather than only that it ran.
 */
export type ReconcileState = {
  error: string | null;
  notice: string | null;
  summary: { checked: number; completed: number; refunded: number; escalated: number } | null;
};

export const INITIAL_RECONCILE_STATE: ReconcileState = {
  error: null,
  notice: null,
  summary: null,
};
