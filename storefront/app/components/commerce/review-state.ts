/**
 * Review form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields hold message keys, resolved by the form.
 */
export type ReviewActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_REVIEW_STATE: ReviewActionState = {
  error: null,
  notice: null,
};
