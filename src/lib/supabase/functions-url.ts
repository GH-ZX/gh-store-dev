/**
 * Where a Supabase Edge Function lives.
 *
 * Payment callbacks are hosted here rather than on the store itself, because
 * this address is public wherever the store happens to be running. Pointing Sam
 * at the site's own URL meant the callback could only work once the store was
 * deployed to a public domain — a payment taken while developing was simply
 * never reported, and the failure was silent.
 *
 * Supabase always serves these over HTTPS, so a callback URL built from it is
 * reachable by construction.
 */
export function functionUrl(supabaseUrl: string, name: string): string {
  return `${supabaseUrl.trim().replace(/\/+$/, "")}/functions/v1/${name}`;
}

/** The one function Sam calls when a payment lands or an invoice expires. */
export const SAM_WEBHOOK_FUNCTION = "sam-webhook";

/**
 * The callback address Sam is given.
 *
 * One builder for every use — the invoice, and the copy of it the dashboard
 * shows the owner. They were briefly built separately, and the panel went on
 * displaying an address no invoice pointed at any more, which is worse than
 * showing nothing because it looks like an answer.
 *
 * The secret is part of the address. Sam offers no other way to authenticate
 * itself, so an owner checking or re-entering the callback needs the whole
 * thing; a version with the token stripped is not the address and cannot be
 * used as one. It is shown only to a signed-in administrator, and should be
 * treated like a password.
 */
export function samCallbackUrl(supabaseUrl: string, secret?: string | null): string {
  const base = functionUrl(supabaseUrl, SAM_WEBHOOK_FUNCTION);

  return secret ? `${base}?token=${encodeURIComponent(secret)}` : base;
}

/** The one function G2Bulk calls when a top-up order finishes or fails. */
export const G2BULK_WEBHOOK_FUNCTION = "g2bulk-webhook";

/**
 * The callback address sent with every top-up order.
 *
 * Hosted alongside the payment callback, for the same reason: the supplier calls
 * it from its own network, so an address that only resolves on a developer's
 * machine is an order that is never reported. The store's own domain is not
 * usable here until it exists.
 *
 * As with Sam, the secret is the address rather than something sent beside it —
 * G2Bulk offers no signature, only whatever URL it was handed at purchase.
 */
export function g2bulkCallbackUrl(supabaseUrl: string, secret?: string | null): string {
  const base = functionUrl(supabaseUrl, G2BULK_WEBHOOK_FUNCTION);

  return secret ? `${base}?token=${encodeURIComponent(secret)}` : base;
}
