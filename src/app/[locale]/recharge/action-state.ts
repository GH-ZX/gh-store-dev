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

/**
 * Binance Pay hand-off state.
 *
 * `checkoutUrl` rather than a redirect: the destination is a third-party page,
 * and the client follows it once the invoice exists so a failure to create one
 * is still readable on the store's own screen.
 */
export type BinanceTopUpState = {
  error: string | null;
  checkoutUrl: string | null;
};

export const INITIAL_BINANCE_STATE: BinanceTopUpState = { error: null, checkoutUrl: null };
