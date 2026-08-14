/**
 * Role and suspension state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields are message keys; the refusals that protect the last
 * administrator arrive here as `error` and are worded by the panel.
 */
export type AccessState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_ACCESS_STATE: AccessState = { error: null, notice: null };
