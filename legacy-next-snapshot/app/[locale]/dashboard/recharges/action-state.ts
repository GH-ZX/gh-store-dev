/**
 * Recharge review state.
 *
 * Outside `actions.ts`: a `"use server"` module may only export async functions.
 */
export type AdminRechargeState = {
  error: string | null;
  notice: string | null;
};

export const INITIAL_ADMIN_RECHARGE_STATE: AdminRechargeState = { error: null, notice: null };
