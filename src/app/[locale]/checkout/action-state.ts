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
export type CheckoutActionState = {
  error: string | null;
};

export const INITIAL_CHECKOUT_STATE: CheckoutActionState = { error: null };

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
