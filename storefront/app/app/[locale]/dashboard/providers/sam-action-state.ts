/**
 * Sam API form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. Both fields are message keys, and neither can carry the API
 * key or the callback secret.
 *
 * The linked wallets are deliberately not here. They used to be returned by the
 * action, which meant they existed only until the next render — an owner who
 * saved their key was shown nothing. They are now read on the page itself, so
 * they survive a reload and appear without being asked for.
 */
export type SamActionState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_SAM_STATE: SamActionState = { error: null, notice: null };
