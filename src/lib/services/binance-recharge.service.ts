import "server-only";

import { requireAuth } from "@/lib/auth/guards";
import { log, logOutcome } from "@/lib/logging/logger";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { readBinanceCredentials } from "@/lib/settings/binance-settings";
import { functionUrl } from "@/lib/supabase/functions-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { BinanceClient, BinanceError, isBinancePaid } from "@/providers/binance/client";
import { toMerchantTradeNo } from "@/providers/binance/signing";

/**
 * Binance Pay top-ups.
 *
 * Follows the Sam path deliberately: the customer-visible recharge request is
 * created first, through the customer's own session so the RPC's limits and
 * suspension checks apply to them, and only then is an invoice opened with the
 * provider. Money reaches the wallet through `credit_recharge_request` like
 * every other top-up.
 *
 * The store prices in USD and Binance bills in crypto. With a dollar-pegged coin
 * those are the same number, which is why USDT is the default and why the pair
 * is stored separately rather than assumed equal — a store that later invoices
 * in BNB must not silently credit a wallet with a coin amount.
 */

export const BINANCE_METHOD = "binance";

/** The function Binance notifies, hosted where a callback can actually reach it. */
export const BINANCE_WEBHOOK_FUNCTION = "binance-webhook";

export type StartBinanceResult =
  | { ok: true; checkoutUrl: string; invoiceId: string }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "invalid_input"
        | "too_many"
        | "suspended"
        | "provider"
        | "unknown";
    };

async function readCredentials() {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();

  return readBinanceCredentials(data?.providers ?? {});
}

/**
 * Where Binance should report the payment.
 *
 * An edge function, for the reason both other callbacks are: the provider calls
 * from its own network, and the store has no public address until it is
 * deployed. Passed on the order itself rather than left to the merchant
 * dashboard, so a store and its callback can never drift apart.
 */
function webhookUrl(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  return supabaseUrl ? functionUrl(supabaseUrl, BINANCE_WEBHOOK_FUNCTION) : null;
}

/**
 * What the recharge page needs to know, and nothing more.
 *
 * Read with service authority because `store_settings.providers` is deliberately
 * absent from the public settings RPC — it holds every credential the store has.
 * Only the switch and the coin come back, so a page that renders this cannot
 * leak anything even by accident.
 */
export async function getBinancePaymentOptions(): Promise<{ enabled: boolean; currency: string }> {
  const credentials = await readCredentials();

  return { enabled: credentials.enabled, currency: credentials.currency };
}

export async function startBinanceTopUp(input: {
  amount: number;
  locale?: Locale;
}): Promise<StartBinanceResult> {
  const result = await attemptBinanceTopUp(input);

  logOutcome("recharge", "binance_topup_started", result, { amount: input.amount });

  return result;
}

async function attemptBinanceTopUp(input: { amount: number; locale?: Locale }): Promise<StartBinanceResult> {
  const user = await requireAuth();
  const credentials = await readCredentials();

  // `enabled` is the owner's explicit yes, not merely the presence of a key.
  if (!credentials.enabled || !credentials.apiKey || !credentials.apiSecret) {
    return { ok: false, reason: "not_configured" };
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, reason: "invalid_input" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: request, error: requestError } = await supabase
    .rpc("submit_recharge_request", {
      p_amount: input.amount,
      p_method: BINANCE_METHOD,
      p_currency: "USD",
    })
    .maybeSingle();

  if (requestError) {
    const text = requestError.message.toLowerCase();

    if (text.includes("too many")) {
      return { ok: false, reason: "too_many" };
    }

    if (text.includes("suspended")) {
      return { ok: false, reason: "suspended" };
    }

    return { ok: false, reason: "invalid_input" };
  }

  if (!request) {
    return { ok: false, reason: "unknown" };
  }

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const client = new BinanceClient({ apiKey: credentials.apiKey, secret: credentials.apiSecret });
  // Deterministic: the same trade number the invoice row will carry, known
  // before the row exists, which is what lets the return address point at this
  // store's own payment screen rather than a page that never changes again.
  const merchantTradeNo = toMerchantTradeNo(request.request_id);

  try {
    const order = await client.createOrder({
      rechargeRequestId: request.request_id,
      // A dollar-pegged invoice is one-for-one; the pair is still recorded
      // separately so nothing here assumes it always will be.
      amount: input.amount,
      currency: credentials.currency,
      description: `Wallet top-up ${request.reference}`,
      returnUrl: `${siteUrl}/${input.locale ?? DEFAULT_LOCALE}/recharge/pay/${encodeURIComponent(merchantTradeNo)}`,
      cancelUrl: `${siteUrl}/recharge`,
      webhookUrl: webhookUrl(),
    });

    /*
     * Written with service authority: `binance_invoices` has no insert policy
     * for a customer, because a row here is the store's own record of what it
     * billed and not something a session should be able to author.
     */
    const service = createSupabaseServiceClient();
    const { data: invoice, error: invoiceError } = await service
      .from("binance_invoices")
      .insert({
        user_id: user.id,
        recharge_request_id: request.request_id,
        merchant_trade_no: merchantTradeNo,
        prepay_id: order.prepayId,
        amount: input.amount,
        currency: "USD",
        charge_amount: input.amount,
        charge_currency: credentials.currency,
        checkout_url: order.checkoutUrl,
        expires_at: order.expireTime ? new Date(order.expireTime).toISOString() : null,
        provider_payload: { prepayId: order.prepayId },
      })
      .select("id")
      .maybeSingle();

    if (invoiceError || !invoice) {
      /*
       * The order exists at Binance but the store has no record of it, so no
       * poll or callback will ever match one to the other. Say so loudly rather
       * than returning a silent unknown.
       */
      log.warn("recharge", "binance_invoice_record_lost", {
        merchantTradeNo,
        requestId: request.request_id,
        error: invoiceError?.message ?? "insert returned no row",
      });

      // Better to refuse the customer now than to send them to a checkout
      // nothing will ever credit.
      return { ok: false, reason: "unknown" };
    }

    return { ok: true, checkoutUrl: order.checkoutUrl, invoiceId: invoice.id };
  } catch (error) {
    if (error instanceof BinanceError) {
      return { ok: false, reason: error.kind === "request" ? "invalid_input" : "provider" };
    }

    return { ok: false, reason: "unknown" };
  }
}

/** The customer's own view of one Binance invoice, for the payment screen. */
export type BinanceInvoiceView = {
  id: string;
  merchantTradeNo: string;
  status: string;
  /** What the wallet receives on success, in store currency. */
  amount: number;
  currency: string;
  /** What the customer was billed, in crypto. */
  chargeAmount: number | null;
  chargeCurrency: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read one of this customer's invoices, by row id or by trade number.
 *
 * Both are scoped to the signed-in account through RLS *and* an explicit filter,
 * same as every other user-scoped read here — an invoice id guessed from
 * elsewhere is a 404, not a window into another account's payment.
 */
export async function getMyBinanceInvoice(key: string): Promise<BinanceInvoiceView | null> {
  const user = await requireAuth();
  const supabase = await createSupabaseServerClient();

  const query = supabase
    .from("binance_invoices")
    .select(
      "id, merchant_trade_no, status, amount, currency, charge_amount, charge_currency, checkout_url, expires_at",
    )
    .eq(UUID_PATTERN.test(key) ? "id" : "merchant_trade_no", key)
    .eq("user_id", user.id);

  const { data } = await query.maybeSingle();

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    merchantTradeNo: data.merchant_trade_no,
    status: data.status,
    amount: data.amount,
    currency: data.currency,
    chargeAmount: data.charge_amount,
    chargeCurrency: data.charge_currency,
    checkoutUrl: data.checkout_url,
    expiresAt: data.expires_at,
  };
}

export type BinanceSyncResult =
  | { ok: true; status: string; credited: boolean }
  | { ok: false; reason: "not_found" | "not_configured" | "provider" | "unknown" };

/**
 * Ask Binance how one of this customer's invoices turned out, and settle it.
 *
 * The payment screen polls this while the customer is at Binance's checkout.
 * Ownership is established before anything is asked of anyone.
 */
export async function syncMyBinanceInvoice(invoiceKey: string): Promise<BinanceSyncResult> {
  const invoice = await getMyBinanceInvoice(invoiceKey);

  if (!invoice) {
    return { ok: false, reason: "not_found" };
  }

  return syncBinanceInvoice(invoice.merchantTradeNo);
}

/**
 * Ask Binance how an invoice turned out, and settle it.
 *
 * The single place that decides a Binance payment. The callback calls into the
 * same question rather than answering it, the payment screen polls it while a
 * customer waits, and the reconciliation sweep asks it for every invoice whose
 * notification never arrived — so a lost webhook costs five minutes, not the
 * customer's money.
 */
export async function syncBinanceInvoice(merchantTradeNo: string): Promise<BinanceSyncResult> {
  const credentials = await readCredentials();

  if (!credentials.apiKey || !credentials.apiSecret) {
    return { ok: false, reason: "not_configured" };
  }

  const service = createSupabaseServiceClient();
  const { data: invoice } = await service
    .from("binance_invoices")
    .select("id, merchant_trade_no, recharge_request_id, status, charge_amount")
    .eq("merchant_trade_no", merchantTradeNo)
    .maybeSingle();

  if (!invoice) {
    return { ok: false, reason: "not_found" };
  }

  // Already settled: nothing to ask and nothing to move.
  if (["credited", "failed", "expired", "cancelled"].includes(invoice.status)) {
    return { ok: true, status: invoice.status, credited: invoice.status === "credited" };
  }

  const client = new BinanceClient({ apiKey: credentials.apiKey, secret: credentials.apiSecret });
  let state: Awaited<ReturnType<BinanceClient["queryOrder"]>>;

  try {
    state = await client.queryOrder(invoice.recharge_request_id);
  } catch {
    return { ok: false, reason: "provider" };
  }

  if (!isBinancePaid(state.status)) {
    /*
     * Only a terminal refusal closes the invoice. Anything else — including a
     * status this store has never seen — leaves it open, because closing an
     * order that is merely still being paid would strand the customer's money.
     */
    const terminal = ["EXPIRED", "CANCELED", "CANCELLED", "ERROR"].includes(
      state.status.toUpperCase(),
    );

    if (terminal) {
      await service.rpc("fail_binance_invoice", {
        p_merchant_trade_no: merchantTradeNo,
        p_status: state.status.toUpperCase() === "EXPIRED" ? "expired" : "cancelled",
        p_payload: { status: state.status },
      });
    }

    return { ok: true, status: state.status, credited: false };
  }

  /*
   * Credit on what Binance says was paid, never on what this store billed.
   * Passing the billed figure back as "paid" would turn the database's
   * short-payment check into a comparison of a value with itself. A PAID order
   * with no reported figure waits — visibly pending, retried by the sweep —
   * until Binance answers the question properly.
   */
  if (state.amount === null || !Number.isFinite(state.amount) || state.amount <= 0) {
    log.warn("payments", "binance_paid_without_amount", {
      merchantTradeNo,
      status: state.status,
    });

    return { ok: true, status: state.status, credited: false };
  }

  const { error } = await service.rpc("credit_binance_invoice", {
    p_merchant_trade_no: merchantTradeNo,
    p_paid_amount: state.amount,
    p_transaction_id: state.transactionId ?? undefined,
    p_payload: { status: state.status },
  });

  if (error) {
    return { ok: false, reason: "unknown" };
  }

  return { ok: true, status: "credited", credited: true };
}
