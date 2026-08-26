import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Sam API payment callback.
 *
 * Hosted here rather than on the store because this address is public wherever
 * the store is running. A callback pointed at the site's own URL could only work
 * once the store was deployed to a public domain, and until then a payment was
 * taken and never reported — silently.
 *
 * Sam offers no request signature, only a secret embedded in the callback URL it
 * was given when the invoice was created. A bearer token in a query string is
 * weak on its own — it appears in access logs — so this treats the callback as a
 * hint that something happened and re-checks every claim against the stored
 * invoice before any money moves:
 *
 *   * The token is compared in constant time, against a digest rather than the
 *     raw values, so a timing signal cannot reveal its length or content.
 *   * The invoice must exist and must not have settled. The store this replaces
 *     would happily flip an expired or cancelled invoice to paid.
 *   * The method and the billed currency must match what we recorded.
 *   * The paid amount must cover the billed amount, checked inside the database
 *     rather than here. The store this replaced compared only the invoice id,
 *     currency and method — never the amount — and then credited the figure taken
 *     straight from the payload, so a callback claiming a large payment was
 *     credited in full.
 *
 * The amount in this payload is therefore evidence, never an instruction: the
 * wallet is credited the store-currency amount recorded when the invoice was
 * created, by a database function this key alone may execute.
 *
 * `verify_jwt` is off for this function — Sam cannot send a Supabase JWT — so the
 * token check below is the only gate and must run before anything else.
 */

type Payload = {
  event?: unknown;
  invoiceId?: unknown;
  method?: unknown;
  currency?: unknown;
  amount?: unknown;
  paidAmount?: unknown;
  transactionRef?: unknown;
  paidAt?: unknown;
};

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(status === 405 ? { allow: "POST" } : {}),
    },
  });
}

async function digest(value: string): Promise<ArrayBuffer> {
  return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

/** Constant-time comparison that does not leak the secret's length. */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([digest(provided), digest(expected)]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }

  return mismatch === 0;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  if (!serviceKey || !supabaseUrl) {
    return json({ ok: false, error: "not_configured" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: settings, error: settingsError } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  if (settingsError) {
    return json({ ok: false, error: "settings_unavailable" }, 503);
  }

  const providers = settings?.providers as { sam?: { webhook_secret?: unknown } } | null;
  const expected = text(providers?.sam?.webhook_secret);
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";

  if (!expected || token.length === 0 || !(await secretMatches(token, expected))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: Payload;

  try {
    body = (await request.json()) as Payload;
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const event = text(body.event)?.toLowerCase() ?? "";
  const invoiceId = text(body.invoiceId);

  if (!invoiceId) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  // Reject an event we do not handle before looking anything up, so the reply
  // says "unsupported" rather than reporting the invoice's unrelated status.
  if (event !== "invoice.paid" && event !== "invoice.expired") {
    return json({ ok: false, error: "unsupported_event" }, 400);
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("sam_invoices")
    .select(
      "sam_invoice_id, status, amount, currency, charge_currency, payment_method, user_id",
    )
    .eq("sam_invoice_id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    return json({ ok: false, error: "invoice_lookup_failed" }, 503);
  }

  if (!invoice) {
    return json({ ok: false, error: "unknown_invoice" }, 404);
  }

  // A settled invoice is final. Reporting success keeps Sam from retrying a
  // callback there is nothing left to do about.
  if (invoice.status === "credited" || invoice.status === "awaiting_review") {
    return json({ ok: true, status: invoice.status, applied: false }, 200);
  }

  if (event === "invoice.expired") {
    const { error } = await supabase.rpc("fail_sam_invoice", {
      p_sam_invoice_id: invoice.sam_invoice_id,
      p_status: "expired",
      p_payload: { source: "webhook" },
    });

    if (error) {
      return json({ ok: false, error: "invoice_update_failed" }, 500);
    }

    return json({ ok: true, status: "expired", applied: true }, 200);
  }

  if (invoice.status === "expired" || invoice.status === "failed" || invoice.status === "cancelled") {
    // Not credited: a payment arriving after the invoice closed needs a human,
    // not an automatic reversal of the closure.
    return json({ ok: true, status: invoice.status, applied: false }, 200);
  }

  const billedCurrency = (invoice.charge_currency ?? invoice.currency ?? "USD").toUpperCase();
  const reportedCurrency = text(body.currency)?.toUpperCase() ?? null;

  if (reportedCurrency !== null && reportedCurrency !== billedCurrency) {
    return json({ ok: false, error: "currency_mismatch" }, 400);
  }

  const reportedMethod = text(body.method)?.toLowerCase() ?? null;

  if (reportedMethod !== null && reportedMethod !== invoice.payment_method) {
    return json({ ok: false, error: "method_mismatch" }, 400);
  }

  const paidAmount = toNumber(body.paidAmount ?? body.amount);

  if (paidAmount === null) {
    // No figure means nothing to check the payment against.
    return json({ ok: false, error: "amount_missing" }, 400);
  }

  /*
   * The owner's review switch. Read at settlement rather than at invoice
   * creation, so turning it on applies to payments already in flight.
   */
  const manualReview =
    (providers?.sam as { manual_review?: unknown } | undefined)?.manual_review === true;

  const args = {
    p_sam_invoice_id: invoice.sam_invoice_id,
    p_paid_amount: paidAmount,
    /*
     * Only what Sam actually reported. Falling back to the billed currency here
     * would make the database's currency check compare a value with itself —
     * money that arrived in some other currency would pass on the strength of
     * our own paperwork. A null tells the RPC the webhook said nothing.
     */
    p_charge_currency: reportedCurrency,
    p_transaction_ref: text(body.transactionRef),
    p_payload: {
      source: "webhook",
      event,
      paidAt: text(body.paidAt),
      reportedAmount: paidAmount,
    },
  };

  const { data, error } = await supabase
    .rpc(manualReview ? "mark_sam_invoice_paid" : "credit_sam_invoice", args)
    .maybeSingle();

  if (error) {
    /*
     * A short or unmatched payment is answered with a 4xx and no credit. A
     * failure on our side answers 5xx so Sam retries rather than treating a
     * payment as delivered — the opposite of the store this replaces, which
     * swallowed a failed credit inside a 200.
     */
    const message = error.message.toLowerCase();
    const refused =
      message.includes("short of the") ||
      message.includes("does not match the invoice currency") ||
      message.includes("paid amount required");

    return json({ ok: false, error: refused ? "refused" : "failed" }, refused ? 409 : 500);
  }

  const result = data as { status?: string; credited?: number; idempotent?: boolean } | null;

  if (manualReview) {
    return json({ ok: true, status: result?.status ?? "awaiting_review", applied: true }, 200);
  }

  /*
   * A settled invoice comes back with its existing status rather than an error —
   * that is what makes a replayed callback harmless. So the status has to be
   * read: treating any non-error reply as credited would announce a top-up
   * because the invoice had already been closed as failed.
   */
  if (result?.status !== "credited") {
    return json({ ok: true, status: result?.status ?? "unknown", applied: false }, 200);
  }

  /*
   * This path credits without an owner, so the customer is the only person who
   * finds out — and `idempotent` guards against a replayed callback announcing
   * the same top-up twice. A failed notification must never fail the credit that
   * already happened, so it is attempted and its result ignored.
   */
  if (!result.idempotent) {
    const amount = (result.credited ?? 0).toFixed(2);

    await supabase
      .from("notifications")
      .insert({
        user_id: invoice.user_id,
        notification_type: "recharge_approved",
        title_ar: "تمت إضافة الرصيد",
        title_en: "Your balance was topped up",
        body_ar: `أضفنا ${amount} دولار إلى محفظتك. يمكنك الشراء به الآن.`,
        body_en: `We added ${amount} USD to your wallet. It is ready to spend.`,
        href: "/wallet",
        entity_type: "recharge",
      })
      .then(() => undefined, () => undefined);
  }

  return json({ ok: true, status: "credited", applied: true }, 200);
});
