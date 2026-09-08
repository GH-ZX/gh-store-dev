/**
 * Balance-adjustment form state.
 *
 * Lives outside `actions.ts` because a `"use server"` module may only export
 * async functions. Fields carry message keys, resolved by the form.
 */
export type CustomerActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_CUSTOMER_STATE: CustomerActionState = { error: null, notice: null };
