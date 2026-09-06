import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@server/lib/logging/logger";
import { readBinanceCredentials } from "@server/lib/settings/binance-settings";
import { BinanceClient, isBinancePaid } from "@server/providers/binance/client";

export type BinanceSyncResult =
  | { ok: true; status: string; credited: boolean }
  | { ok: false; reason: "not_configured" | "not_found" | "provider" | "unknown" };

/**
 * Ask Binance about one invoice and credit it if paid.
 *
 * Read-only except on Binance's own word: crediting requires Binance itself
 * to say paid, and the credited figure is what Binance reports — never what
 * this store billed, so the database's short-payment check keeps meaning
 * something. Extracted as the sweep's Binance half; the interactive path
 * keeps living wherever the payment screens land.
 */
export async function syncBinanceInvoice(
  service: SupabaseClient,
  merchantTradeNo: string,
): Promise<BinanceSyncResult> {
  const { data: settingsRow } = await service
    .from("store_settings")
    .select("providers")
    .eq("id", "global")
    .maybeSingle();
  const credentials = readBinanceCredentials(
    (settingsRow as unknown as { providers?: unknown } | null)?.providers ?? {},
  );

  if (!credentials.apiKey || !credentials.apiSecret) {
    return { ok: false, reason: "not_configured" };
  }

  const { data: invoice } = await service
    .from("binance_invoices")
    .select("id, merchant_trade_no, recharge_request_id, status, charge_amount")
    .eq("merchant_trade_no", merchantTradeNo)
    .maybeSingle();

  if (!invoice) {
    return { ok: false, reason: "not_found" };
  }

  const row = invoice as unknown as {
    recharge_request_id: string;
    status: string;
  };

  if (["credited", "failed", "expired", "cancelled"].includes(row.status)) {
    return { ok: true, status: row.status, credited: row.status === "credited" };
  }

  const client = new BinanceClient({ apiKey: credentials.apiKey, secret: credentials.apiSecret });
  let state: Awaited<ReturnType<BinanceClient["queryOrder"]>>;

  try {
    state = await client.queryOrder(row.recharge_request_id);
  } catch {
    return { ok: false, reason: "provider" };
  }

  if (!isBinancePaid(state.status)) {
    // Only a terminal refusal closes the invoice. Anything else leaves it
    // open: closing an order that is merely still being paid would strand money.
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
