import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  toBatStoreGameCode,
  toBatStoreGameSlug,
  toBatStoreOfferSlug,
  toOfferType,
  ACTIVATION_FIELD_KEY,
} from "@/providers/batstore/mapping";
import {
  classifyOrderStatus,
  orderSchema,
  productSchema,
  productsSchema,
  toBatStoreOrder,
  toBatStoreProduct,
} from "@/providers/batstore/schemas";

type ProductInput = z.input<typeof productSchema>;

describe("batstore mapping codes", () => {
  it("namespaces the product code so suppliers cannot collide", () => {
    expect(toBatStoreGameCode("123")).toBe("product:123");
    expect(toBatStoreGameCode(7)).toBe("product:7");
  });
});

describe("batstore slugs", () => {
  it("derives a slug from the name and keeps the product id", () => {
    expect(toBatStoreGameSlug({ id: "123", name: "Netflix Premium" })).toBe(
      "netflix-premium-123",
    );
    expect(toBatStoreGameSlug({ id: "42", name: "Grok" })).toBe("grok-42");
  });

  it("falls back to the provider id when a name has no usable characters", () => {
    expect(toBatStoreGameSlug({ id: "9", name: "!!!" })).toBe("batstore-9");
  });

  it("builds the offer slug the same way, unique per product", () => {
    expect(toBatStoreOfferSlug({ id: "7", name: "Spotify" })).toBe("spotify-7");
  });
});

describe("batstore offer type", () => {
  it("treats every product as a top-up: each delivers against an identifier", () => {
    expect(toOfferType({ id: "1", name: "Grok" })).toBe("topup");
  });

  it("exposes the activation field key the importer and fulfilment share", () => {
    expect(ACTIVATION_FIELD_KEY).toBe("activation_identifier");
  });
});

describe("batstore product list", () => {
  it("accepts the wrapped response the API actually sends", () => {
    const parsed = productsSchema.safeParse({
      success: true,
      products: [{ id: 12, name: "Grok 1 month", price_usd: 5.0 }],
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data[0].name).toBe("Grok 1 month");
    }
  });

  it("still accepts a bare array", () => {
    const parsed = productsSchema.safeParse([{ id: 1, name: "Netflix", price_usd: 9.99 }]);

    expect(parsed.success).toBe(true);
  });
});

describe("batstore product mapping", () => {
  it("maps the documented fields and defaults the rest", () => {
    const product = toBatStoreProduct({
      id: "123",
      name: "Netflix",
      price_usd: "9.99",
      standard_price_usd: 12.99,
      delivery_type: "email",
      stock: "5",
      api_test: false,
    } satisfies ProductInput);

    expect(product).toMatchObject({
      id: "123",
      name: "Netflix",
      priceUsd: 9.99,
      standardPriceUsd: 12.99,
      deliveryType: "email",
      stock: 5,
      isTest: false,
    });
  });

  it("marks a test product and tolerates missing fields", () => {
    const product = toBatStoreProduct({ id: "t1", name: "", api_test: true } satisfies ProductInput);

    expect(product.isTest).toBe(true);
    expect(product.name).toBe("t1");
    expect(product.priceUsd).toBe(0);
    expect(product.stock).toBeNull();
  });
});

describe("batstore order classification", () => {
  it("delivers once items arrive, whatever the status says", () => {
    const order = toBatStoreOrder({
      id: "1",
      status: "processing",
      items: [{ id: "i1", account_data: "user@example.com" }],
    });

    expect(classifyOrderStatus(order)).toBe("completed");
    expect(order.items[0].accountData).toBe("user@example.com");
  });

  it("treats an explicit failure wording as failed", () => {
    const order = toBatStoreOrder({ id: "1", status: "failed", items: [] });

    expect(classifyOrderStatus(order)).toBe("failed");
  });

  it("reads the documented statuses: completed and cancelled", () => {
    expect(classifyOrderStatus(toBatStoreOrder({ id: "1", status: "COMPLETED", items: [] }))).toBe(
      "completed",
    );
    expect(
      classifyOrderStatus(toBatStoreOrder({ id: "2", status: "CANCELLED", items: [] })),
    ).toBe("failed");
  });

  it("treats the still-working statuses as pending", () => {
    for (const status of [
      "PAID_PENDING_DELIVERY",
      "AWAITING_ACTIVATION_INFO",
      "AWAITING_ACTIVATION",
    ]) {
      expect(classifyOrderStatus(toBatStoreOrder({ id: "1", status, items: [] }))).toBe("pending");
    }
  });

  it("treats anything unrecognised as still working", () => {
    const order = toBatStoreOrder({ id: "1", status: "queued", items: [] });

    expect(classifyOrderStatus(order)).toBe("pending");
  });

  it("accepts the wrapped create response as well as the bare order", () => {
    const wrapped = toBatStoreOrder({ success: true, order: { id: "9", status: "accepted" } });

    expect(wrapped.id).toBe("9");
    expect(classifyOrderStatus(wrapped)).toBe("pending");
  });

  // Regression for a live outage: the create (and get) response is
  // `{ success, order: {...} }`. When the bare-order branch could parse it with
  // an absent `id`, the union picked that branch first, stripped the nested
  // `order`, and the attempt recorded no supplier order number even though the
  // order was placed and paid. The schema must hand the wrapped order through
  // intact.
  it("keeps the wrapped order intact when parsed through the schema", () => {
    const parsed = orderSchema.safeParse({
      success: true,
      status: "ok",
      idempotent: true,
      order: {
        id: 31868,
        status: "COMPLETED",
        product_id: 21,
        product_name: "Nord Vpn 3months and 6 months and 1 year",
        quantity: 1,
        amount_usd: 2.5,
        delivery_type: "stock",
        customer_reference: "GS-D8E0E9BB44",
        idempotency_key: "58087366-cb36-48c6-a18e-5cbcaedab8d6",
        items: [{ id: 51427, account_data: "ryuxDiGWAkDVJP6UNQ6qTc3Nr" }],
      },
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      const order = toBatStoreOrder(parsed.data);

      expect(order.id).toBe("31868");
      expect(order.status).toBe("COMPLETED");
      expect(order.items).toHaveLength(1);
      expect(classifyOrderStatus(order)).toBe("completed");
    }
  });

  it("still parses a bare order body with an id", () => {
    const parsed = orderSchema.safeParse({
      id: 12,
      status: "PAID_PENDING_DELIVERY",
      items: [],
    });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(toBatStoreOrder(parsed.data).id).toBe("12");
    }
  });

  it("refuses a wrapped response with a null order instead of dropping it", () => {
    const parsed = orderSchema.safeParse({ success: true, order: null });

    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(toBatStoreOrder(parsed.data).id).toBe("");
    }
  });
});