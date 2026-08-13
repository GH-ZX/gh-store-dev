/**
 * Recharge form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields hold message keys, resolved by the form.
 */
export type RechargeActionState = {
  error: string | null;
  notice: string | null;
  /** Set on success so the page can show the payment reference to quote. */
  reference: string | null;
  credited: boolean;
};

export const INITIAL_RECHARGE_STATE: RechargeActionState = {
  error: null,
  notice: null,
  reference: null,
  credited: false,
};
