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
 * The callback address Sam is given, without its secret.
 *
 * One builder for both uses: the invoice attaches the secret to this, and the
 * dashboard shows it as-is. They were briefly built separately, and the panel
 * went on displaying an address no invoice pointed at any more — which is worse
 * than showing nothing, because it looks like an answer.
 */
export function samCallbackUrl(supabaseUrl: string): string {
  return functionUrl(supabaseUrl, SAM_WEBHOOK_FUNCTION);
}
