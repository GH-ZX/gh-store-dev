/**
 * Recharge form state.
 *
 * Outside `actions.ts` because a `"use server"` module may only export async
 * functions. `error` and `notice` hold message keys, resolved by the form.
 */
export type RechargeActionState = {
  error: string | null;
  notice: string | null;
  /** Set on success so the page can show the payment reference to quote. */
  reference: string | null;
  /** Set on success so the page can point at the request's own status page. */
  requestId: string | null;
  credited: boolean;
};

export const INITIAL_RECHARGE_STATE: RechargeActionState = {
  error: null,
  notice: null,
  reference: null,
  requestId: null,
  credited: false,
};

/**
 * Binance Pay hand-off state.
 *
 * `checkoutUrl` rather than a redirect: the destination is a third-party page,
 * and the client follows it once the invoice exists so a failure to create one
 * is still readable on the store's own screen.
 *
 * `invoiceId` sends the customer to this store's own payment screen for that
 * invoice, which links on to Binance and watches the outcome — the same shape
 * the Sam flow uses. A customer sent straight to Binance had nowhere to come
 * back to but their wallet, where a payment still in flight looks identical to
 * one that failed.
 */
export type BinanceTopUpState = {
  error: string | null;
  checkoutUrl: string | null;
  invoiceId: string | null;
  /** Binance's own status for the invoice, set by the poll action. */
  status?: string | null;
};

export const INITIAL_BINANCE_STATE: BinanceTopUpState = {
  error: null,
  checkoutUrl: null,
  invoiceId: null,
};
