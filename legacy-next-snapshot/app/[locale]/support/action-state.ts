/**
 * Support form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields hold message keys, resolved by the form.
 */
export type SupportActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_SUPPORT_STATE: SupportActionState = {
  error: null,
  notice: null,
};
