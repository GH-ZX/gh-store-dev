/**
 * Account form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. Both fields carry message *keys*, so the action stays
 * locale-agnostic and the form resolves the wording.
 */
export type AccountActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_ACCOUNT_STATE: AccountActionState = { error: null, notice: null };
