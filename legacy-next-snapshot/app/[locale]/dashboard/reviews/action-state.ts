/**
 * Review moderation form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields hold message keys, resolved by the form.
 */
export type ReviewModerationState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_MODERATION_STATE: ReviewModerationState = {
  error: null,
  notice: null,
};
