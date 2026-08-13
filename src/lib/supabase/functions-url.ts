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
