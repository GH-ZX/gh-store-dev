import { describe, expect, it } from "vitest";
import {
  buildInvoiceLines,
  buildRechargeDocument,
  type InvoiceLineInput,
} from "@/lib/services/invoice-document";

const LINE: InvoiceLineInput = {
  name: "60 UC",
  quantity: 1,
  unitPrice: 5,
  totalPrice: 5,
  fields: [],
  codes: [],
};

describe("buildInvoiceLines", () => {
  it("folds an order item into a document line", () => {
    const [line] = buildInvoiceLines([LINE]);

    expect(line).toMatchObject({
      name: "60 UC",
      quantity: 1,
      unitPrice: 5,
      totalPrice: 5,
      fields: [],
      codes: [],
    });
  });

  it("returns an empty list for an empty order", () => {
    expect(buildInvoiceLines([])).toEqual([]);
  });

  it("keeps the account details a customer submitted, trimmed", () => {
    const [line] = buildInvoiceLines([
      {
        ...LINE,
        fields: [
          { label: "Player ID", value: "  123456  " },
          { label: "Server", value: "America" },
        ],
      },
    ]);

    expect(line.fields).toEqual([
      { label: "Player ID", value: "123456" },
      { label: "Server", value: "America" },
    ]);
  });

  it("drops blank account entries rather than writing empty promises", () => {
    const [line] = buildInvoiceLines([
      {
        ...LINE,
        fields: [
          { label: "Player ID", value: "123456" },
          { label: "Server", value: "   " },
          { label: " ", value: "orphan value" },
        ],
      },
    ]);

    expect(line.fields).toEqual([{ label: "Player ID", value: "123456" }]);
  });

  it("de-duplicates delivered codes and drops blanks, in order", () => {
    const [line] = buildInvoiceLines([
      {
        ...LINE,
        codes: ["ABC-111", " ", "ABC-111", "abc-111"],
      },
    ]);

    expect(line.codes).toEqual(["ABC-111", "abc-111"]);
  });
});

describe("buildRechargeDocument", () => {
  const CUSTOMER = { name: "Customer", email: "c@example.com" };

  it("folds a recharge request into a document", () => {
    const document = buildRechargeDocument({
      reference: "RC-123",
      requestedAt: "2026-08-18T10:00:00Z",
      resolvedAt: "2026-08-18T11:00:00Z",
      status: "approved",
      paymentMethod: "shamcash",
      currency: "usd",
      requestedAmount: 25,
      creditedAmount: 25,
      exchangeRate: null,
      adminNote: null,
      customer: CUSTOMER,
    });

    expect(document).toMatchObject({
      rechargeReference: "RC-123",
      status: "approved",
      paymentMethod: "shamcash",
      currency: "USD",
      requestedAmount: 25,
      creditedAmount: 25,
      exchangeRate: null,
      adminNote: null,
      customer: CUSTOMER,
    });
  });

  it("keeps the requested and credited amounts when they differ", () => {
    const document = buildRechargeDocument({
      reference: "RC-2",
      requestedAt: "2026-08-18T10:00:00Z",
      resolvedAt: null,
      status: "approved",
      paymentMethod: "bank",
      currency: "USD",
      requestedAmount: 50,
      creditedAmount: 48.5,
      exchangeRate: 13000,
      adminNote: null,
      customer: CUSTOMER,
    });

    expect(document.creditedAmount).toBe(48.5);
    expect(document.exchangeRate).toBe(13000);
  });

  it("normalises an empty admin note to null and trims a real one", () => {
    const document = buildRechargeDocument({
      reference: "RC-3",
      requestedAt: "2026-08-18T10:00:00Z",
      resolvedAt: null,
      status: "approved",
      paymentMethod: "shamcash",
      currency: "USD",
      requestedAmount: 10,
      creditedAmount: 10,
      exchangeRate: null,
      adminNote: "  Thank you  ",
      customer: CUSTOMER,
    });

    expect(document.adminNote).toBe("Thank you");
    expect(buildRechargeDocument({ ...base("RC-3"), adminNote: "   " }).adminNote).toBeNull();
  });
});

function base(reference: string) {
  return {
    reference,
    requestedAt: "2026-08-18T10:00:00Z",
    resolvedAt: null,
    status: "approved",
    paymentMethod: "shamcash",
    currency: "USD",
    requestedAmount: 10,
    creditedAmount: 10,
    exchangeRate: null,
    adminNote: null,
    customer: { name: null, email: null },
  };
}