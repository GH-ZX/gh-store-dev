/**
 * Logging settings state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields are message keys; nothing here can carry the token.
 */
export type AxiomActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_AXIOM_STATE: AxiomActionState = { error: null, notice: null };
