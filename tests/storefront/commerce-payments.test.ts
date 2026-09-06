import { describe, expect, it, vi } from "vitest";
import { resolveSamPaidAmount, getMySamInvoice } from "@server/lib/services/sam-recharge.service";
import { getMyBinanceInvoice, syncMyBinanceInvoice } from "@server/lib/services/binance-recharge.service";

function sessionClient(row: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: row }) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const client = { from: vi.fn().mockReturnValue(query), auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: "customer-1" } } }) } };
  return { client: client as never, query };
}

describe("migrated payment ownership", () => {
  it("scopes SAM invoices to the authenticated customer", async () => {
    const { client, query } = sessionClient();
    expect(await getMySamInvoice(client, "provider-invoice")).toBeNull();
    expect(query.eq).toHaveBeenCalledWith("sam_invoice_id", "provider-invoice");
    expect(query.eq).toHaveBeenCalledWith("user_id", "customer-1");
  });
  it.each([
    ["123e4567-e89b-12d3-a456-426614174000", "id"],
    ["merchant-trade-number", "merchant_trade_no"],
  ])("finds Binance return identifiers %s without widening ownership", async (key, column) => {
    const { client, query } = sessionClient();
    expect(await getMyBinanceInvoice(client, key)).toBeNull();
    expect(query.eq).toHaveBeenCalledWith(column, key);
    expect(query.eq).toHaveBeenCalledWith("user_id", "customer-1");
  });
  it("does not contact the provider or access service credentials for another customer's invoice", async () => {
    const { client } = sessionClient();
    expect(await syncMyBinanceInvoice(client, "not-owned")).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("migrated SAM settlement evidence", () => {
  it("preserves an underpayment instead of substituting the requested amount", () => {
    expect(resolveSamPaidAmount({ paidAmount: 4, amount: 10 })).toBe(4);
  });
  it("accepts the provider invoice figure only when explicit payment evidence is absent", () => {
    expect(resolveSamPaidAmount({ paidAmount: null, amount: 10 })).toBe(10);
  });
  it.each([null, 0, -4, Number.NaN, Number.POSITIVE_INFINITY])("never credits unusable payment evidence %s", (amount) => {
    expect(resolveSamPaidAmount({ paidAmount: amount, amount })).toBeNull();
  });
});
