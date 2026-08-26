import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncBinanceInvoice } from "@/lib/services/binance-recharge.service";

/**
 * The settlement decision for a Binance top-up.
 *
 * The invariant under test: a wallet is credited on what Binance *reports*, or
 * not at all. The store's own billed figure must never travel back as evidence
 * of payment — doing so turns the database's short-payment check into X === X.
 */

const hoisted = vi.hoisted(() => {
  const state = {
    invoice: {
      id: "inv-1",
      merchant_trade_no: "MT123",
      recharge_request_id: "req-1",
      status: "pending",
      charge_amount: 10,
    },
    queryResult: null as {
      status: string;
      transactionId: string | null;
      amount: number | null;
    } | null,
    queryCalls: 0,
    rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
  };

  return state;
});

vi.mock("@/lib/logging/logger", () => ({
  log: { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} },
  logFailure: () => {},
  logOutcome: () => {},
}));

vi.mock("@/lib/settings/binance-settings", () => ({
  readBinanceCredentials: () => ({
    enabled: true,
    apiKey: "key",
    apiSecret: "secret",
    currency: "USDT",
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  hasServiceRoleKey: () => true,
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: hoisted.invoice }),
        }),
      }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      hoisted.rpcCalls.push({ name, args });

      return { error: null };
    },
  }),
}));

vi.mock("@/providers/binance/client", () => {
  class BinanceError extends Error {
    readonly kind: string;

    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
    }
  }

  return {
    BinanceError,
    isBinancePaid: (status: string) => status.trim().toUpperCase() === "PAID",
    BinanceClient: class {
      async queryOrder() {
        hoisted.queryCalls += 1;

        return hoisted.queryResult;
      }
    },
  };
});

describe("syncBinanceInvoice", () => {
  beforeEach(() => {
    hoisted.queryCalls = 0;
    hoisted.rpcCalls = [];
    hoisted.invoice.status = "pending";
    hoisted.queryResult = { status: "PAID", transactionId: "tx-1", amount: 10 };
  });

  it("credits on Binance's reported amount when it agrees with the bill", async () => {
    const result = await syncBinanceInvoice("MT123");

    expect(result).toEqual({ ok: true, status: "credited", credited: true });
    expect(hoisted.rpcCalls).toHaveLength(1);
    expect(hoisted.rpcCalls[0].name).toBe("credit_binance_invoice");
    expect(hoisted.rpcCalls[0].args.p_paid_amount).toBe(10);
  });

  it("passes Binance's figure through even when it differs from the bill", async () => {
    hoisted.queryResult = { status: "PAID", transactionId: "tx-1", amount: 7.5 };

    await syncBinanceInvoice("MT123");

    // The database's short-payment guard does the refusing; this side's job is
    // never to hand it our own expectation as "paid".
    expect(hoisted.rpcCalls[0].args.p_paid_amount).toBe(7.5);
    expect(hoisted.rpcCalls[0].args.p_paid_amount).not.toBe(hoisted.invoice.charge_amount);
  });

  it("never credits a paid order that reported no amount", async () => {
    hoisted.queryResult = { status: "PAID", transactionId: "tx-1", amount: null };

    const result = await syncBinanceInvoice("MT123");

    expect(result).toEqual({ ok: true, status: "PAID", credited: false });
    expect(hoisted.rpcCalls).toHaveLength(0);
  });

  it("closes an order Binance refused as expired", async () => {
    hoisted.queryResult = { status: "EXPIRED", transactionId: null, amount: null };

    const result = await syncBinanceInvoice("MT123");

    expect(result).toMatchObject({ ok: true, credited: false });
    expect(hoisted.rpcCalls).toHaveLength(1);
    expect(hoisted.rpcCalls[0]).toMatchObject({
      name: "fail_binance_invoice",
      args: { p_status: "expired" },
    });
  });

  it("leaves an unsettled, non-terminal status alone", async () => {
    hoisted.queryResult = { status: "PENDING", transactionId: null, amount: null };

    const result = await syncBinanceInvoice("MT123");

    expect(result).toEqual({ ok: true, status: "PENDING", credited: false });
    expect(hoisted.rpcCalls).toHaveLength(0);
  });

  it("answers a settled invoice without asking Binance again", async () => {
    hoisted.invoice.status = "credited";

    const result = await syncBinanceInvoice("MT123");

    expect(result).toEqual({ ok: true, status: "credited", credited: true });
    expect(hoisted.queryCalls).toBe(0);
    expect(hoisted.rpcCalls).toHaveLength(0);
  });
});
