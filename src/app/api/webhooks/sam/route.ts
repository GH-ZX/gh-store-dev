import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { failSamInvoice, settleSamInvoice } from "@/lib/services/sam-recharge.service";
import { createSupabaseServiceClient, hasServiceRoleKey } from "@/lib/supabase/service";
import type { Json } from "@/types/database";

/**
 * Sam API payment callback.
 *
 * Sam offers no request signature, only a secret embedded in the callback URL it
 * was given when the invoice was created. A bearer token in a query string is
 * weak on its own — it appears in access logs — so this route treats the callback
 * as a hint that something happened and re-checks every claim against the stored
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
 * created.
 */

const payloadSchema = z.object({
  event: z.string(),
  invoiceId: z.string().min(1),
  method: z.string().nullish(),
  currency: z.string().nullish(),
  amount: z.union([z.string(), z.number()]).nullish(),
  paidAmount: z.union([z.string(), z.number()]).nullish(),
  transactionRef: z.string().nullish(),
  paidAt: z.string().nullish(),
});

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time comparison that does not leak the secret's length. */
function secretMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

async function readWebhookSecret(): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service.from("store_settings").select("providers").eq("id", "global").maybeSingle();
  const providers = data?.providers;

  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return null;
  }

  const sam = (providers as { sam?: { webhook_secret?: unknown } }).sam;

  return typeof sam?.webhook_secret === "string" && sam.webhook_secret.trim().length > 0
    ? sam.webhook_secret.trim()
    : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const expected = await readWebhookSecret();

  if (!expected || token.length === 0 || !secretMatches(token, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const event = parsed.data.event.trim().toLowerCase();

  // Reject an event we do not handle before looking anything up, so the reply
  // says "unsupported" rather than reporting the invoice's unrelated status.
  if (event !== "invoice.paid" && event !== "invoice.expired") {
    return NextResponse.json({ ok: false, error: "unsupported_event" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data: invoice } = await service
    .from("sam_invoices")
    .select("sam_invoice_id, status, amount, currency, charge_amount, charge_currency, payment_method")
    .eq("sam_invoice_id", parsed.data.invoiceId)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "unknown_invoice" }, { status: 404 });
  }

  // A settled invoice is final. Reporting success keeps Sam from retrying a
  // callback there is nothing left to do about.
  if (invoice.status === "credited" || invoice.status === "awaiting_review") {
    return NextResponse.json({ ok: true, status: invoice.status, applied: false });
  }

  if (event === "invoice.expired") {
    await failSamInvoice(invoice.sam_invoice_id, "expired", { source: "webhook" } as Json);

    return NextResponse.json({ ok: true, status: "expired", applied: true });
  }

  if (invoice.status === "expired" || invoice.status === "failed" || invoice.status === "cancelled") {
    // Not credited: a payment arriving after the invoice closed needs a human,
    // not an automatic reversal of the closure.
    return NextResponse.json({ ok: true, status: invoice.status, applied: false });
  }

  const billedCurrency = (invoice.charge_currency ?? invoice.currency ?? "USD").toUpperCase();
  const reportedCurrency = parsed.data.currency?.trim().toUpperCase() ?? null;

  if (reportedCurrency !== null && reportedCurrency !== billedCurrency) {
    return NextResponse.json({ ok: false, error: "currency_mismatch" }, { status: 400 });
  }

  const reportedMethod = parsed.data.method?.trim().toLowerCase() ?? null;

  if (reportedMethod !== null && reportedMethod !== invoice.payment_method) {
    return NextResponse.json({ ok: false, error: "method_mismatch" }, { status: 400 });
  }

  const paidAmount = toNumber(parsed.data.paidAmount ?? parsed.data.amount);

  if (paidAmount === null) {
    // No figure means nothing to check the payment against.
    return NextResponse.json({ ok: false, error: "amount_missing" }, { status: 400 });
  }

  const result = await settleSamInvoice({
    samInvoiceId: invoice.sam_invoice_id,
    paidAmount,
    chargeCurrency: reportedCurrency ?? billedCurrency,
    transactionRef: parsed.data.transactionRef ?? null,
    payload: {
      source: "webhook",
      event,
      paidAt: parsed.data.paidAt ?? null,
      reportedAmount: paidAmount,
    } as Json,
  });

  if (!result.ok) {
    /*
     * A short or unmatched payment is answered with a 4xx and no credit. A
     * failure on our side answers 5xx so Sam retries rather than treating a
     * payment as delivered — the opposite of the store this replaces, which
     * swallowed a failed credit inside a 200.
     */
    const status = result.reason === "short_payment" || result.reason === "not_paid" ? 409 : 500;

    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, status: result.status, applied: true });
}
