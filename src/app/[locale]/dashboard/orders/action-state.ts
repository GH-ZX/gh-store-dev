/**
 * Order operation state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. Both fields are message keys; `outcome` carries the fulfilment
 * state a retry produced, so the page can say what actually happened rather than
 * just "done".
 */
export type OrderOpState = {
  error: string | null;
  notice: string | null;
  outcome: string | null;
};

export const INITIAL_ORDER_OP_STATE: OrderOpState = { error: null, notice: null, outcome: null };
