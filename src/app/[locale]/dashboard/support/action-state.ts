/**
 * Support queue form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields hold message keys, resolved by the form.
 */
export type SupportQueueActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_SUPPORT_QUEUE_STATE: SupportQueueActionState = {
  error: null,
  notice: null,
};
