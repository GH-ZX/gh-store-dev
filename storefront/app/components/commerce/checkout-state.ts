/**
 * Checkout form state.
 *
 * Separate from `actions.ts` because a `"use server"` module may only export
 * async functions. `error` carries a message *key* from the checkout namespace,
 * so the action stays locale-agnostic and the form resolves the wording.
 *
 * There is no success state: a placed order redirects to its own page, and a
 * checkout form that renders "done" while the order lives elsewhere invites a
 * second submit.
 */

/**
 * What the server computed for a coupon code, for display only.
 *
 * `discount` and `total` were computed server-side and are shown back to the
 * customer as a quote. The client cannot influence either: the code is the
 * only coupon-shaped thing the form submits, and the discount that is charged
 * is recomputed inside the order transaction.
 */
export type CheckoutCouponPreview = {
  code: string;
  discount: number;
  total: number;
} | null;

export type CheckoutActionState = {
  error: string | null;
  /** Present when the last submit carried a coupon code. */
  coupon?: CheckoutCouponPreview;
};

export const INITIAL_CHECKOUT_STATE: CheckoutActionState = { error: null, coupon: null };

/**
 * Namespace for the account fields inside the form.
 *
 * A supplier field key is arbitrary text, so an unprefixed input called `locale`
 * or `quantity` would collide with checkout's own fields. Both the form and the
 * action derive the input name from this prefix.
 */
export const CHECKOUT_FIELD_PREFIX = "field_";

export function checkoutFieldName(fieldKey: string): string {
  return `${CHECKOUT_FIELD_PREFIX}${fieldKey}`;
}
